import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Clock, Globe, X, Send, Trash2, Bot, User, ChevronDown, Plus, Edit2, Paperclip, LayoutGrid, Check, Copy, Wifi, WifiOff, Loader2, Square, Settings, Sparkles } from 'lucide-react'
import { useWebSocket } from '../../hooks/useWebSocket'
import MarkdownRenderer from '../common/MarkdownRenderer'
import { listCategories, listScripts, getConfig, updateModel, getProviders, listChatSessions, saveChatSessions, getSearchEngine } from '../../api/client'
import type { ChatMessage, ToolCall, WSMessage } from '../../types'
import { MessageAttachments, InputAttachments } from '../AttachmentsAdapter'
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from '@/components/ai-elements/reasoning'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CategoryInfo { id: string; name: string; name_en: string; icon: string }

interface ChatSession {
  id: string
  name: string
  createdAt: number
}

interface BookmarkItem { url: string; title: string; favicon: string; category?: string; createdAt: number }
interface HistoryItem  { url: string; title: string; favicon: string; visitedAt: number }

interface Props {
  onNavigate:  (url: string) => void
  bookmarks:   BookmarkItem[]
  history:     HistoryItem[]
}

// ── Auto-categorization (fallback when no category field) ──────────────────────

const CATEGORY_RULES: { id: string; pattern: RegExp }[] = [
  { id: "search", pattern: /google|baidu|bing|duckduckgo|sogou|yahoo|brave/ },
  { id: "entertainment", pattern: /youtube|bilibili|netflix|iqiyi|youku|vimeo|twitch|douyin/ },
  { id: "social", pattern: /twitter|x\.com|facebook|instagram|weibo|linkedin|tiktok|discord/ },
  { id: "shopping", pattern: /amazon|taobao|jd\.com|tmall|pinduoduo|ebay|aliexpress|shopify/ },
  { id: "tools", pattern: /github|gitlab|stackoverflow|npmjs|pypi|vercel|railway|cloudflare|docker/ },
  { id: "news", pattern: /news|bbc|cnn|xinhua|sina\.com|sohu|people\.com|reuters|theguardian/ },
  { id: "ai", pattern: /openai|chatgpt|claude|gemini|deepseek|huggingface|cohere|midjourney/ },
  { id: "finance", pattern: /bank|alipay|paypal|finance|trading|invest|stock|fund|crypto/ },
]

function fallbackCategorize(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase()
    for (const rule of CATEGORY_RULES) {
      if (rule.pattern.test(host)) return rule.id
    }
  } catch (_) {}
  return "other"
}

// ── Default quick links ───────────────────────────────────────────────────────

const DEFAULT_LINKS = [
  { title: 'Google',    url: 'https://google.com',       emoji: '🔍' },
  { title: 'GitHub',    url: 'https://github.com',       emoji: '💻' },
  { title: 'YouTube',   url: 'https://youtube.com',      emoji: '🎬' },
  { title: 'Bilibili',  url: 'https://bilibili.com',     emoji: '🎬' },
  { title: 'X',         url: 'https://x.com',            emoji: '💬' },
  { title: 'ChatGPT',   url: 'https://chatgpt.com',      emoji: '🤖' },
  { title: '百度',       url: 'https://baidu.com',        emoji: '🔍' },
  { title: 'Wikipedia', url: 'https://wikipedia.org',    emoji: '📖' },
]

// ── Preset Models ─────────────────────────────────────────────────────────────

const PRESET_MODELS: Record<string, { label: string; value: string }[]> = {
  openrouter: [
    { label: 'Claude Opus 4.5', value: 'anthropic/claude-opus-4-5' },
    { label: 'Claude Sonnet 4.6', value: 'anthropic/claude-sonnet-4-6' },
    { label: 'GPT-4o', value: 'openai/gpt-4o' },
    { label: 'Gemini 2.0 Flash', value: 'google/gemini-2.0-flash-001' },
    { label: 'DeepSeek R1', value: 'deepseek/deepseek-r1' },
  ],
  anthropic: [
    { label: 'Claude Opus 4.5', value: 'claude-opus-4-5' },
    { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
    { label: 'Claude Haiku 3.5', value: 'claude-haiku-3-5' },
  ],
  openai: [
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'GPT-4o mini', value: 'gpt-4o-mini' },
    { label: 'o3-mini', value: 'o3-mini' },
  ],
  deepseek: [
    { label: 'DeepSeek Chat', value: 'deepseek-chat' },
    { label: 'DeepSeek Reasoner', value: 'deepseek-reasoner' },
  ],
  gemini: [
    { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
    { label: 'Gemini 2.0 Pro', value: 'gemini-2.0-pro' },
  ],
  groq: [
    { label: 'Llama 3.3 70B', value: 'llama-3.3-70b-versatile' },
    { label: 'Mixtral 8x7B', value: 'mixtral-8x7b-32768' },
  ],
  moonshot: [
    { label: 'Kimi K2.5', value: 'kimi-k2.5' },
    { label: 'moonshot-v1-8k', value: 'moonshot-v1-8k' },
  ],
  zhipu: [
    { label: 'GLM-4', value: 'glm-4' },
    { label: 'GLM-4-Flash', value: 'glm-4-flash' },
  ],
  dashscope: [
    { label: 'Qwen Max', value: 'qwen-max' },
    { label: 'Qwen Plus', value: 'qwen-plus' },
  ],
  volcengine: [
    { label: 'Doubao Pro 32k', value: 'doubao-pro-32k' },
    { label: 'Doubao Lite 32k', value: 'doubao-lite-32k' },
  ],
  siliconflow: [
    { label: 'DeepSeek-V3', value: 'deepseek-ai/DeepSeek-V3' },
    { label: 'Qwen2.5 72B', value: 'Qwen/Qwen2.5-72B-Instruct' },
  ],
  minimax: [
    { label: 'MiniMax-01', value: 'minimax-01' },
    { label: 'abab6.5s', value: 'abab6.5s-chat' },
  ],
}

// ── Default Scripts ───────────────────────────────────────────────────────────

const DEFAULT_SCRIPTS: Script[] = [
  { id: 'default-1', name: '总结页面', prompt: '请总结当前浏览器页面的主要内容（使用 browser_get_page_content 工具）', icon: '📝' },
  { id: 'default-2', name: '截图分析', prompt: '请截取当前页面截图并描述你看到的内容', icon: '📸' },
  { id: 'default-3', name: '提取链接', prompt: '请列出当前页面上所有重要链接', icon: '🔗' },
  { id: 'default-4', name: '翻译页面', prompt: '请将当前页面的主要内容翻译成中文（使用 browser_get_page_content 工具读取）', icon: '🌐' },
  { id: 'default-5', name: '填写表单', prompt: '请帮我查看当前页面有哪些表单字段，并提示我如何填写', icon: '📋' },
]

// ── Provider Labels ───────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  gemini: 'Google Gemini',
  groq: 'Groq',
  minimax: 'MiniMax',
  moonshot: 'Moonshot',
  zhipu: '智谱',
  dashscope: '通义千问',
  volcengine: '火山引擎',
  siliconflow: 'SiliconFlow',
  aihubmix: 'AIHubMix',
  azure_openai: 'Azure OpenAI',
  vllm: 'vLLM',
  custom: 'Custom',
}

// ── Helper Types ─────────────────────────────────────────────────────────────-

interface Script { id: string; name: string; prompt: string; icon: string }
interface ProviderConfig { apiKey?: string; apiBase?: string; models?: { label: string; value: string }[] }

// ── Tool Call Card Component ──────────────────────────────────────────────────

function ToolCallCard({ tool }: { tool: ToolCall }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const statusConfig = {
    pending: { icon: Loader2, className: 'animate-spin text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
    running: { icon: Loader2, className: 'animate-spin text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
    done: { icon: Check, className: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/30' },
    error: { icon: X, className: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  }[tool.status]

  const StatusIcon = statusConfig.icon

  return (
    <div className={`mt-2 rounded-lg border ${statusConfig.border} ${statusConfig.bg} overflow-hidden`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2.5 text-left hover:bg-nb-raised/30 transition-colors"
      >
        <StatusIcon size={14} className={statusConfig.className} />
        <span className="font-mono text-sm text-brand-400 font-medium">{tool.name}</span>
        <span className="text-nb-text-muted text-xs flex-1 truncate">
          ({Object.keys(tool.args).join(', ')})
        </span>
        {expanded ? <ChevronDown size={14} className="text-nb-text-dim" /> : <span className="text-nb-text-dim">›</span>}
      </button>
      {expanded && (
        <div className="border-t border-nb-border/50 px-3 py-3 space-y-3 bg-nb-card/40">
          <div>
            <p className="text-nb-text-muted mb-1.5 uppercase tracking-wide text-[10px] font-medium">{t('chat.toolArgs') || '参数'}</p>
            <pre className="text-nb-text-soft whitespace-pre-wrap break-all font-mono text-[11px] bg-nb-raised/50 rounded-md p-2">
              {JSON.stringify(tool.args, null, 2)}
            </pre>
          </div>
          {tool.result !== undefined && (
            <div>
              <p className="text-nb-text-muted mb-1.5 uppercase tracking-wide text-[10px] font-medium">{t('chat.toolResult') || '结果'}</p>
              <pre className="text-nb-text-soft whitespace-pre-wrap break-all font-mono text-[11px] bg-nb-raised/50 rounded-md p-2 max-h-40 overflow-y-auto">
                {tool.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Message Bubble Component ──────────────────────────────────────────────────

function MessageBubble({ msg, isStreaming }: { msg: ChatMessage; isStreaming?: boolean }) {
  const isUser = msg.role === 'user'
  const [showCopy, setShowCopy] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (msg.content) {
      await navigator.clipboard.writeText(msg.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    if (isToday) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const isReasoningStreaming = !!(isStreaming && msg.reasoning && !msg.content)

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center mt-0.5 shadow-lg shadow-brand-500/20">
          <Bot size={15} className="text-white" />
        </div>
      )}
      <div className={`max-w-[85%] ${isUser ? 'order-first' : ''}`}>
        {!isUser && msg.reasoning && (
          <Reasoning isStreaming={isReasoningStreaming} className="mb-2">
            <ReasoningTrigger />
            <ReasoningContent>{msg.reasoning}</ReasoningContent>
          </Reasoning>
        )}

        <div
          className={`relative px-4 py-3 rounded-2xl text-sm leading-relaxed transition-all duration-200 ${
            isUser
              ? 'bg-gradient-to-br from-brand-600 to-brand-700 text-white rounded-tr-sm shadow-lg shadow-brand-500/25'
              : 'bg-nb-card text-nb-text rounded-tl-sm border border-nb-border shadow-sm'
          }`}
          onMouseEnter={() => setShowCopy(true)}
          onMouseLeave={() => setShowCopy(false)}
        >
          {!msg.content && msg.role === 'assistant' && !msg.toolCalls?.length && (
            <span className="inline-flex items-center gap-1 px-1">
              <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '120ms' }} />
              <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '240ms' }} />
            </span>
          )}
          {msg.content && !isUser && (
            <div className="select-text">
              <MarkdownRenderer content={msg.content} />
            </div>
          )}
          {msg.content && isUser && (
            <div className="select-text whitespace-pre-wrap">{msg.content}</div>
          )}
          {isUser && msg.files && msg.files.length > 0 && (
            <MessageAttachments files={msg.files} className="mt-2" />
          )}
          {msg.content && showCopy && (
            <button
              onClick={handleCopy}
              className="absolute -right-2 -top-2 p-1.5 rounded-lg bg-nb-card border border-nb-border hover:bg-nb-raised hover:border-brand-500/50 transition-all duration-150 shadow-sm hover:scale-105 active:scale-95"
              title={copied ? '已复制' : '复制'}
            >
              {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} className="text-nb-text-dim" />}
            </button>
          )}
        </div>
        {msg.createdAt && (
          <p className={`text-[10px] text-nb-text-muted mt-1 ${isUser ? 'text-right' : 'text-left'} px-1`}>
            {formatTime(msg.createdAt)}
          </p>
        )}
        {msg.toolCalls?.map((tool) => <ToolCallCard key={tool.id} tool={tool} />)}
      </div>
      {isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-nb-raised to-nb-hover flex items-center justify-center mt-0.5 shadow-sm">
          <User size={15} className="text-nb-text-soft" />
        </div>
      )}
    </div>
  )
}

// ── Model Selector Component ──────────────────────────────────────────────────

function ModelSelector({
  currentModel,
  currentProvider,
  onSelect,
  onOpenSettings,
}: {
  currentModel: string
  currentProvider: string
  onSelect: (model: string, provider: string) => void
  onOpenSettings?: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [providerConfigs, setProviderConfigs] = useState<Record<string, ProviderConfig>>({})
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    getProviders()
      .then((res) => setProviderConfigs(res.providers || {}))
      .catch(() => setProviderConfigs({}))
  }, [open])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const configuredProviders = Object.keys(providerConfigs)

  const getProviderModels = (provider: string) => {
    const config = providerConfigs[provider]
    if (config?.models && config.models.length > 0) return config.models
    return PRESET_MODELS[provider] || []
  }

  const getModelLabel = (model: string, provider: string) => {
    if (!model) return t('chat.selectModel') || '选择模型'
    if (provider) {
      const models = getProviderModels(provider)
      const found = models.find(p => p.value === model)
      if (found) return found.label
    }
    for (const p of Object.keys(PRESET_MODELS)) {
      const models = PRESET_MODELS[p]
      const found = models?.find(m => m.value === model)
      if (found) return found.label
    }
    return model.length > 20 ? model.slice(0, 20) + '...' : model
  }

  const isSelected = (model: string, provider: string) => currentModel === model && currentProvider === provider

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-0.5 px-2 py-1.5 rounded-md text-xs text-nb-text-dim hover:text-nb-text hover:bg-nb-hover transition-colors"
        title={t('chat.switchModel')}
      >
        <span className="max-w-[100px] truncate">{getModelLabel(currentModel, currentProvider)}</span>
        {open ? <span>▲</span> : <span>▼</span>}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-60 bg-nb-card border border-nb-border rounded-lg shadow-xl z-50 overflow-hidden">
          {configuredProviders.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-xs text-nb-text-muted mb-2">{t('chat.noProvidersConfigured') || '尚未配置服务商'}</p>
              <button
                onClick={() => { setOpen(false); onOpenSettings?.() }}
                className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                {t('chat.configureModels')}
              </button>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {configuredProviders.map(provider => {
                const models = getProviderModels(provider)
                if (models.length === 0) return null
                return (
                  <div key={provider} className="border-b border-nb-border last:border-b-0">
                    <div className="px-3 py-1.5 text-[10px] text-nb-text-muted uppercase tracking-wider bg-nb-raised/30">
                      {PROVIDER_LABELS[provider] || provider}
                    </div>
                    {models.map(model => (
                      <button
                        key={model.value}
                        onClick={() => { onSelect(model.value, provider); setOpen(false) }}
                        className={`flex items-center gap-2 w-full px-3 py-2 text-left text-xs transition-colors ${
                          isSelected(model.value, provider)
                            ? 'text-brand-400 bg-brand-500/10'
                            : 'text-nb-text-dim hover:text-nb-text hover:bg-nb-raised'
                        }`}
                      >
                        {isSelected(model.value, provider) ? <Check size={12} className="shrink-0" /> : <span className="w-3" />}
                        <span>{model.label}</span>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
          <div className="border-t border-nb-border">
            <button
              onClick={() => { setOpen(false); onOpenSettings?.() }}
              className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs text-nb-text-dim hover:text-nb-text hover:bg-nb-raised transition-colors"
            >
              <Settings size={12} />
              <span>{t('chat.configureModels')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helper Components ─────────────────────────────────────────────────────────

function SiteFavicon({ url, favicon, emoji }: { url: string; favicon?: string; emoji?: string }) {
  const [err, setErr] = useState(false)
  if (favicon && !err) {
    return <img src={favicon} onError={() => setErr(true)} className="w-7 h-7 object-contain" alt="" />
  }
  if (emoji) return <span className="text-2xl leading-none">{emoji}</span>
  try {
    const host = new URL(url).hostname
    const gFavicon = `https://www.google.com/s2/favicons?domain=${host}&sz=64`
    return <img src={gFavicon} onError={() => setErr(true)} className="w-7 h-7 object-contain" alt="" />
  } catch (_) {
    return <Globe size={24} className="text-nb-text-muted" />
  }
}

function QuickCard({ title, url, favicon, emoji, onNavigate }: {
  title: string; url: string; favicon?: string; emoji?: string
  onNavigate: (url: string) => void
}) {
  return (
    <div className="group relative flex flex-col items-center gap-2 cursor-pointer" onClick={() => onNavigate(url)}>
      <div className="w-14 h-14 rounded-2xl bg-nb-card/80 hover:bg-nb-raised/80 border border-nb-border/50 hover:border-nb-border
                      flex items-center justify-center transition-all duration-150 shadow-sm hover:shadow-md hover:-translate-y-0.5">
        <SiteFavicon url={url} favicon={favicon} emoji={emoji} />
      </div>
      <span className="text-xs text-nb-text-dim group-hover:text-nb-text-soft text-center max-w-[72px] truncate transition-colors">
        {title}
      </span>
    </div>
  )
}

function LiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const hm  = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const sec = now.toLocaleTimeString('zh-CN', { second: '2-digit' }).replace(/.*:/, '')
  const date = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div className="flex items-end gap-1">
        <span className="text-7xl font-thin text-nb-text tabular-nums tracking-tight">{hm}</span>
        <span className="text-3xl font-thin text-nb-text-dim tabular-nums mb-2">:{sec}</span>
      </div>
      <p className="text-sm text-nb-text-muted">{date}</p>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function NewTabPage({ onNavigate, bookmarks, history }: Props) {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')
  const [categories, setCategories] = useState<CategoryInfo[]>([])

  // Chat state
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string>('')
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMessage[]>>({})
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [scripts, setScripts] = useState<Script[]>(DEFAULT_SCRIPTS)
  const [currentModel, setCurrentModel] = useState('')
  const [currentProvider, setCurrentProvider] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; data: string; type: string }[]>([])
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [showSidebar, setShowSidebar] = useState(true)
  const [showQuickAccess, setShowQuickAccess] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [quickAccessWidth, setQuickAccessWidth] = useState(384) // default w-96 = 384px
  const [isResizingQuickAccess, setIsResizingQuickAccess] = useState(false)
  const [searchEngine, setSearchEngine] = useState('bing')

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)
  const streamingMsgIdRef = useRef<string | null>(null)
  const pendingToolsRef = useRef<Map<string, string>>(new Map())
  const tokenBufferRef = useRef('')
  const reasoningBufferRef = useRef('')
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const quickAccessResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const { send, onMessage, status } = useWebSocket(currentSessionId)

  // Load search engine config
  useEffect(() => {
    getSearchEngine().then(data => {
      if (data.engine) setSearchEngine(data.engine)
    }).catch(() => {})
  }, [])

  // Quick Access resize handlers
  const handleQuickAccessResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizingQuickAccess(true)
    quickAccessResizeRef.current = {
      startX: e.clientX,
      startWidth: quickAccessWidth,
    }
  }, [quickAccessWidth])

  useEffect(() => {
    if (!isResizingQuickAccess) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!quickAccessResizeRef.current) return
      const { startX, startWidth } = quickAccessResizeRef.current
      const delta = startX - e.clientX // negative when dragging right
      const newWidth = Math.max(240, Math.min(600, startWidth + delta))
      setQuickAccessWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizingQuickAccess(false)
      quickAccessResizeRef.current = null
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingQuickAccess])

  // Load categories
  useEffect(() => {
    listCategories().then(setCategories).catch(() => {})
  }, [])

  // Initialize chat sessions - always create a new session for fresh start
  useEffect(() => {
    const newSessionId = `session-${Date.now()}`
    const newSession: ChatSession = {
      id: newSessionId,
      name: `新会话`,
      createdAt: Date.now()
    }
    setSessions([newSession])
    setMessagesBySession({ [newSessionId]: [] })
    setCurrentSessionId(newSessionId)
  }, [])

  // Load config
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const cfg = await getConfig()
        const raw = cfg.config as Record<string, unknown>
        const agents = raw?.agents as Record<string, unknown> | undefined
        const defaults = agents?.defaults as Record<string, unknown> | undefined
        let model = (defaults?.model as string) ?? ''
        let provider = (defaults?.provider as string) ?? ''
        if (!model && Object.keys(PRESET_MODELS).length > 0) {
          const firstProvider = Object.keys(PRESET_MODELS)[0]
          const firstModel = PRESET_MODELS[firstProvider][0]
          model = firstModel.value
          provider = firstProvider
        }
        setCurrentModel(model)
        setCurrentProvider(provider)
      } catch {}
    }
    loadConfig()
  }, [])

  // Load scripts
  useEffect(() => {
    listScripts().then(serverScripts => {
      const hasCustomScripts = serverScripts.some(s => !s.id.startsWith('default-'))
      if (hasCustomScripts || serverScripts.length > DEFAULT_SCRIPTS.length) {
        setScripts(serverScripts)
      }
    }).catch(() => {})
  }, [])

  // Persist messages
  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      const fullSessions = sessions.map(s => ({
        ...s,
        messages: messagesBySession[s.id] || [],
      }))
      saveChatSessions(fullSessions, currentSessionId).catch(() => {})
    }, 800)
    return () => { if (persistTimerRef.current) clearTimeout(persistTimerRef.current) }
  }, [messagesBySession, sessions, currentSessionId])

  // WebSocket message handling
  useEffect(() => {
    onMessage((msg: WSMessage) => {
      if (msg.type === 'token') {
        tokenBufferRef.current += msg.content ?? ''
        flushTokenBuffer()
      } else if (msg.type === 'reasoning') {
        reasoningBufferRef.current += msg.content ?? ''
        flushTokenBuffer()
      } else if (msg.type === 'tool_call') {
        flushTokenBuffer()
        const toolCall: ToolCall = {
          id: msg.call_id ?? Math.random().toString(36).slice(2),
          name: msg.name ?? '', args: msg.args ?? {}, status: 'running',
        }
        setMessagesBySession(prev => {
          if (!streamingMsgIdRef.current) return prev
          const msgId = streamingMsgIdRef.current
          pendingToolsRef.current.set(toolCall.id, msgId)
          return {
            ...prev,
            [currentSessionId]: (prev[currentSessionId] ?? []).map((m) => m.id === msgId ? { ...m, toolCalls: [...(m.toolCalls ?? []), toolCall] } : m)
          }
        })
      } else if (msg.type === 'tool_result') {
        flushTokenBuffer()
        const callId = msg.call_id ?? ''
        const msgId = pendingToolsRef.current.get(callId)
        if (msgId) {
          setMessagesBySession(prev => ({
            ...prev,
            [currentSessionId]: (prev[currentSessionId] ?? []).map((m) => m.id === msgId ? {
              ...m, toolCalls: m.toolCalls?.map((t) => t.id === callId ? { ...t, result: String(msg.content ?? ''), status: 'done' } : t),
            } : m)
          }))
        }
      } else if (msg.type === 'done') {
        flushTokenBuffer()
        setIsStreaming(false); streamingMsgIdRef.current = null; pendingToolsRef.current.clear()
      } else if (msg.type === 'error') {
        flushTokenBuffer()
        setIsStreaming(false); streamingMsgIdRef.current = null; pendingToolsRef.current.clear()
        setMessagesBySession(prev => ({
          ...prev,
          [currentSessionId]: [...(prev[currentSessionId] ?? []), { id: `err-${Date.now()}`, role: 'assistant', content: `错误：${msg.content ?? '未知错误'}`, createdAt: Date.now() }]
        }))
      } else if (msg.type === 'stopped') {
        flushTokenBuffer()
        setIsStreaming(false); streamingMsgIdRef.current = null; pendingToolsRef.current.clear()
      } else if (msg.type === 'history_cleared') {
        tokenBufferRef.current = ''
        reasoningBufferRef.current = ''
        setMessagesBySession(prev => ({ ...prev, [currentSessionId]: [] }))
      }
    })
  }, [onMessage, currentSessionId])

  const flushTokenBuffer = useCallback(() => {
    if (!tokenBufferRef.current && !reasoningBufferRef.current) return
    const contentChunk = tokenBufferRef.current
    const reasoningChunk = reasoningBufferRef.current
    tokenBufferRef.current = ''
    reasoningBufferRef.current = ''
    const msgId = streamingMsgIdRef.current
    if (!msgId) return
    setMessagesBySession(prev => ({
      ...prev,
      [currentSessionId]: (prev[currentSessionId] ?? []).map((m) => {
        if (m.id !== msgId) return m
        return {
          ...m,
          ...(contentChunk && { content: (m.content ?? '') + contentChunk }),
          ...(reasoningChunk && { reasoning: (m.reasoning ?? '') + reasoningChunk }),
        }
      })
    }))
  }, [currentSessionId])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messagesBySession[currentSessionId], scrollToBottom])

  const sendMessage = useCallback((overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if ((!text && attachedFiles.length === 0) || isStreaming || status !== 'connected') return
    const userMsgId = `user-${Date.now()}`
    const assistantMsgId = `assistant-${Date.now()}`
    const userContent = text || (attachedFiles.length > 0 ? `[上传了 ${attachedFiles.length} 个文件]` : '')

    setMessagesBySession(prev => ({
      ...prev,
      [currentSessionId]: [...(prev[currentSessionId] ?? []),
        { id: userMsgId, role: 'user', content: userContent, files: attachedFiles, createdAt: Date.now() },
        { id: assistantMsgId, role: 'assistant', content: '', reasoning: '', toolCalls: [], createdAt: Date.now() },
      ]
    }))
    streamingMsgIdRef.current = assistantMsgId
    setIsStreaming(true)
    setInput('')
    setAttachedFiles([])
    send({ type: 'chat', content: userContent, files: attachedFiles.length > 0 ? attachedFiles : undefined })
  }, [input, isStreaming, status, send, attachedFiles, currentSessionId])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(undefined)
    }
  }, [sendMessage])

  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      const newHeight = Math.min(textarea.scrollHeight, 128)
      textarea.style.height = `${newHeight}px`
    }
  }, [])

  useEffect(() => { adjustTextareaHeight() }, [input, adjustTextareaHeight])

  const clearHistory = () => {
    send({ type: 'clear_history' })
    setMessagesBySession(prev => ({ ...prev, [currentSessionId]: [] }))
  }

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const data = ev.target?.result as string
        setAttachedFiles(prev => [...prev, { name: file.name, data, type: file.type }])
      }
      reader.readAsDataURL(file)
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const removeAttachedFile = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  // 拖拽上传处理
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current += 1
    if (dragCounterRef.current === 1) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current -= 1
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragging(false)

    if (status !== 'connected') return

    const files = e.dataTransfer.files
    if (!files || files.length === 0) return

    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.txt', '.xlsx', '.xls']

    Array.from(files).forEach(file => {
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase()
      const isValidType = file.type.startsWith('image/') ||
        file.type === 'application/pdf' ||
        file.type === 'application/msword' ||
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.type === 'application/vnd.ms-excel' ||
        file.type === 'text/plain' ||
        validExtensions.includes(fileExt)

      if (!isValidType) {
        console.warn('[NewTabPage] 不支持的文件类型:', file.type, file.name)
        return
      }

      const reader = new FileReader()
      reader.onload = (ev) => {
        const data = ev.target?.result as string
        setAttachedFiles(prev => [...prev, {
          name: file.name,
          data,
          type: file.type || 'application/octet-stream'
        }])
      }
      reader.readAsDataURL(file)
    })
  }, [status])

  // 右键菜单处理
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // 如果在输入框或可编辑区域，不显示自定义右键菜单
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }

    e.preventDefault()
    const eAPI = (window as any).electronAPI
    eAPI?.showContextMenu?.({
      x: e.clientX,
      y: e.clientY,
      linkURL: '',
      linkText: '',
      srcURL: '',
      mediaType: 'none',
      selectionText: window.getSelection()?.toString() || '',
      isEditable: false,
    })
  }, [])

  const stopGeneration = () => {
    send({ type: 'stop' })
    setIsStreaming(false)
    streamingMsgIdRef.current = null
    pendingToolsRef.current.clear()
  }

  const handleModelChange = async (model: string, provider: string) => {
    try {
      await updateModel(model, provider)
      setCurrentModel(model)
      setCurrentProvider(provider)
    } catch {}
  }

  // Session management
  const createNewSession = () => {
    const newSession: ChatSession = {
      id: `session-${Date.now()}`,
      name: `新会话 ${sessions.length + 1}`,
      createdAt: Date.now()
    }
    setSessions(prev => [...prev, newSession])
    setCurrentSessionId(newSession.id)
    setMessagesBySession(prev => ({ ...prev, [newSession.id]: [] }))
  }

  const renameSession = (id: string, name: string) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, name } : s))
  }

  const deleteSession = (id: string) => {
    if (sessions.length <= 1) return
    setSessions(prev => prev.filter(s => s.id !== id))
    if (currentSessionId === id) {
      const remaining = sessions.filter(s => s.id !== id)
      setCurrentSessionId(remaining[0]?.id || '')
    }
    setMessagesBySession(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const switchSession = (id: string) => {
    setCurrentSessionId(id)
    setEditingSessionId(null)
  }

  const handleSearch = () => {
    const q = search.trim()
    if (!q) return
    if (/^[a-z][a-z\d+\-.]*:\/\//i.test(q)) onNavigate(q)
    else if (q.includes('.') && !q.includes(' ')) onNavigate('https://' + q)
    else {
      const engineUrls: Record<string, string> = {
        bing: 'https://www.bing.com/search?q=',
        google: 'https://www.google.com/search?q=',
        baidu: 'https://www.baidu.com/s?wd=',
        duckduckgo: 'https://duckduckgo.com/?q=',
      }
      const url = `${engineUrls[searchEngine] || engineUrls.bing}${encodeURIComponent(q)}`
      onNavigate(url)
    }
  }

  // Quick access data
  const categoryMap = new Map(categories.map(c => [c.id, c]))
  const getCategoryDisplayName = (catId: string): string => {
    const cat = categoryMap.get(catId)
    if (!cat) return catId
    return i18n.language === 'zh-CN' ? cat.name : (cat.name_en || cat.name)
  }
  const getCategoryIcon = (catId: string): string => categoryMap.get(catId)?.icon || '📌'

  const hasBookmarks = bookmarks.length > 0
  const grouped = hasBookmarks
    ? bookmarks.reduce<Record<string, BookmarkItem[]>>((acc, bm) => {
        const cat = bm.category || fallbackCategorize(bm.url)
        if (!acc[cat]) acc[cat] = []
        acc[cat].push(bm)
        return acc
      }, {})
    : {}

  const seen = new Set<string>()
  const recent = history.filter(h => {
    try {
      const host = new URL(h.url).hostname
      if (seen.has(host) || !h.url || h.url.startsWith('about:')) return false
      seen.add(host); return true
    } catch { return false }
  }).slice(0, 8)

  const currentMessages = messagesBySession[currentSessionId] || []

  return (
    <div
      className="w-full h-full bg-nb-base flex"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onContextMenu={handleContextMenu}
    >
      {/* 拖拽时的遮罩提示 */}
      {isDragging && (
        <div className="absolute inset-0 bg-brand-500/10 border-2 border-dashed border-brand-500/50 rounded-xl flex items-center justify-center z-50 pointer-events-none backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-brand-500 bg-nb-base/80 px-6 py-4 rounded-2xl shadow-2xl">
            <div className="p-3 bg-brand-500/10 rounded-full">
              <Paperclip size={28} />
            </div>
            <span className="text-sm font-medium">松开以上传文件</span>
          </div>
        </div>
      )}
      {/* Sidebar - Session List */}
      {showSidebar && (
        <div className="w-64 border-r border-nb-border bg-nb-card flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-nb-border">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-brand-400" />
              <span className="font-semibold text-sm">对话历史</span>
            </div>
            <button
              onClick={createNewSession}
              className="p-1.5 rounded-lg hover:bg-nb-raised text-nb-text-dim hover:text-brand-400 transition-colors"
              title="新建会话"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.map(session => (
              <div
                key={session.id}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  session.id === currentSessionId
                    ? 'bg-brand-500/10 text-brand-400'
                    : 'hover:bg-nb-raised text-nb-text-soft'
                }`}
              >
                {editingSessionId === session.id ? (
                  <input
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onBlur={() => {
                      if (editingName.trim()) renameSession(session.id, editingName.trim())
                      setEditingSessionId(null)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        if (editingName.trim()) renameSession(session.id, editingName.trim())
                        setEditingSessionId(null)
                      }
                    }}
                    className="flex-1 bg-nb-card border border-nb-border rounded px-1.5 py-1 text-xs outline-none focus:border-brand-500"
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <button
                      onClick={() => switchSession(session.id)}
                      className="flex-1 text-left text-xs truncate"
                    >
                      {session.name}
                    </button>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingSessionId(session.id)
                          setEditingName(session.name)
                        }}
                        className="p-1 rounded text-nb-text-dim hover:text-nb-text hover:bg-nb-hover transition-colors"
                      >
                        <Edit2 size={10} />
                      </button>
                      {sessions.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteSession(session.id)
                          }}
                          className="p-1 rounded text-nb-text-dim hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Quick Access Toggle */}
          <div className="border-t border-nb-border p-3">
            <button
              onClick={() => setShowQuickAccess(!showQuickAccess)}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-nb-text-dim hover:text-nb-text hover:bg-nb-raised rounded-lg transition-colors"
            >
              <LayoutGrid size={12} />
              <span>{showQuickAccess ? '隐藏快速访问' : '显示快速访问'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-nb-border bg-nb-card">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-1.5 rounded-lg hover:bg-nb-raised text-nb-text-dim hover:text-nb-text transition-colors"
              title={showSidebar ? '隐藏侧边栏' : '显示侧边栏'}
            >
              <LayoutGrid size={16} />
            </button>
            <div className="flex items-center gap-2">
              <Bot size={16} className="text-brand-400" />
              <span className="text-sm font-semibold text-nb-text">
                {sessions.find(s => s.id === currentSessionId)?.name || '对话'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-nb-text-dim">
              {status === 'connected'
                ? <Wifi size={12} className="text-green-400" />
                : <WifiOff size={12} className="text-red-600 dark:text-red-400" />}
              <span>{t(`chat.status.${status}`) || status}</span>
            </div>
            <button onClick={clearHistory} title={t('chat.clearHistory')}
              className="p-1.5 rounded hover:bg-nb-raised text-nb-text-dim hover:text-nb-text transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
          {currentMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-nb-text-muted">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-brand-500/20 to-brand-600/20 rounded-full blur-xl" />
                <Bot size={48} className="relative text-brand-400/60" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-nb-text-soft">{t('chat.empty')}</p>
                <p className="text-xs text-nb-text-muted max-w-[200px]">{t('chat.emptyHint')}</p>
              </div>
              {/* Quick Scripts */}
              <div className="flex gap-2 mt-2 flex-wrap justify-center">
                {scripts.slice(0, 3).map(s => (
                  <button
                    key={s.id}
                    onClick={() => sendMessage(s.prompt)}
                    disabled={isStreaming || status !== 'connected'}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-nb-border/50 bg-nb-card/50 text-[11px] text-nb-text-dim hover:text-brand-500 hover:border-brand-500/30 transition-all duration-150"
                  >
                    <span>{s.icon}</span>
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>

              {/* Quick Search */}
              <div className="w-full max-w-md mt-4">
                <div className="flex items-center gap-3 bg-nb-deepest/40 border border-nb-border/70 hover:border-nb-text-muted/60
                                focus-within:border-brand-500/50 rounded-2xl px-4 py-3 transition-all">
                  <Search size={18} className="text-nb-text-muted shrink-0" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
                    placeholder={t('newTab.searchPlaceholder')}
                    className="flex-1 bg-transparent text-base text-nb-text placeholder:text-nb-text-muted outline-none"
                  />
                </div>
              </div>
            </div>
          )}
          {currentMessages.map((msg, index) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isStreaming={isStreaming && index === currentMessages.length - 1}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input Area - 上下布局 */}
        <div className="px-3 py-3 border-t border-nb-border bg-gradient-to-t from-nb-card to-nb-card/80">
          <InputAttachments
            files={attachedFiles}
            onRemove={removeAttachedFile}
            className="mb-2"
          />

          {/* 文本编辑区域 - 上层 */}
          <div className="bg-nb-deepest/40 hover:bg-nb-deepest/60 rounded-2xl px-4 py-3 transition-all duration-150 focus-within:bg-nb-deepest/60 focus-within:ring-2 focus-within:ring-brand-500/30 border border-nb-border/50 focus-within:border-brand-500/40">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.placeholder')}
              rows={3}
              disabled={status !== 'connected'}
              className="w-full bg-transparent text-sm text-nb-text placeholder:text-nb-text-muted outline-none resize-none max-h-32 scrollbar-thin disabled:opacity-50 leading-relaxed"
            />
          </div>

          {/* 功能按钮区域 - 下层 */}
          <div className="flex items-center justify-between mt-2 px-1">
            {/* 左侧：文件按钮 */}
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.txt"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={status !== 'connected'}
                className="shrink-0 p-1.5 rounded-lg text-nb-text-dim hover:text-brand-500 hover:bg-brand-500/10 transition-all duration-150 disabled:opacity-50"
                title="上传文件"
              >
                <Paperclip size={16} />
              </button>
            </div>

            {/* 右侧：模型选择和发送 */}
            <div className="flex items-center gap-2">
              <ModelSelector
                currentModel={currentModel}
                currentProvider={currentProvider}
                onSelect={handleModelChange}
              />
              {isStreaming ? (
                <div className="relative group">
                  <button className="shrink-0 p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 transition-all">
                    <Loader2 size={16} className="animate-spin text-amber-500" />
                  </button>
                  <button
                    onClick={stopGeneration}
                    className="absolute inset-0 shrink-0 p-2 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/20 border border-red-500/30 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center shadow-sm"
                    title="停止生成"
                  >
                    <Square size={14} className="text-red-500" />
                  </button>
                </div>
              ) : (
                <button onClick={() => sendMessage(undefined)}
                  disabled={!input.trim() || status !== 'connected'}
                  className="shrink-0 px-4 py-2 rounded-xl bg-gradient-to-br from-brand-600 to-brand-700 hover:from-brand-500 hover:to-brand-600 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 shadow-sm hover:shadow-md hover:shadow-brand-500/20 active:scale-95 disabled:hover:shadow-none flex items-center gap-1.5"
                >
                  <Send size={14} />
                  <span className="text-xs font-medium">发送</span>
                </button>
              )}
            </div>
          </div>

          <p className="text-[11px] text-nb-text-muted/70 mt-1.5 pl-2">
            {t('chat.hint')}
          </p>
        </div>
      </div>

      {/* Quick Access Panel (Collapsible) */}
      {showQuickAccess && (
        <div
          className="relative border-l border-nb-border bg-nb-card overflow-y-auto scrollbar-thin flex-shrink-0"
          style={{ width: quickAccessWidth }}
        >
          {/* Resize handle - left edge */}
          <div
            onMouseDown={handleQuickAccessResizeStart}
            className={`absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize group z-10 flex items-center justify-center -ml-1 ${
              isResizingQuickAccess ? 'bg-brand-500' : 'hover:bg-brand-500/50'
            }`}
          >
            <div className="w-0.5 h-4 rounded-full bg-nb-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="p-4 space-y-6">
            {/* Clock */}
            <div className="text-center py-2">
              <LiveClock />
            </div>

            {/* Bookmarks */}
            {hasBookmarks ? (
              <div className="space-y-4">
                {Object.entries(grouped).slice(0, 3).map(([catId, items]) => {
                  const catName = getCategoryDisplayName(catId)
                  const catIcon = getCategoryIcon(catId)
                  return (
                    <div key={catId}>
                      <h3 className="text-xs font-semibold text-nb-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <span>{catIcon}</span>
                        <span>{catName}</span>
                      </h3>
                      <div className="grid grid-cols-4 gap-2">
                        {items.slice(0, 8).map((bm, i) => (
                          <QuickCard
                            key={i}
                            title={bm.title || bm.url}
                            url={bm.url}
                            favicon={bm.favicon}
                            onNavigate={onNavigate}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div>
                <h3 className="text-xs font-semibold text-nb-text-muted uppercase tracking-wider mb-3">{t('newTab.defaultLinks')}</h3>
                <div className="grid grid-cols-4 gap-2">
                  {DEFAULT_LINKS.map((link, i) => (
                    <QuickCard
                      key={i}
                      title={link.title}
                      url={link.url}
                      emoji={link.emoji}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Recent History */}
            {recent.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-nb-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Clock size={11} /> {t('newTab.recent')}
                </h3>
                <div className="flex gap-2 flex-wrap">
                  {recent.slice(0, 6).map((h, i) => (
                    <button
                      key={i}
                      onClick={() => onNavigate(h.url)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-nb-base border border-nb-border
                                 hover:bg-nb-raised hover:border-nb-text-muted text-nb-text-dim hover:text-nb-text-soft
                                 text-xs transition-all"
                    >
                      {h.favicon
                        ? <img src={h.favicon} className="w-3.5 h-3.5 object-contain" alt="" onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                        : <Globe size={12} className="opacity-60" />}
                      <span className="max-w-[100px] truncate">{h.title || h.url}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
