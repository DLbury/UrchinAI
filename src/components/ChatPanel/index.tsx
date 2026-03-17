import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Trash2, Bot, User, ChevronDown, ChevronRight, Terminal, CheckCircle, XCircle, Loader2, Wifi, WifiOff, Zap, ChevronUp, Check, Settings } from 'lucide-react'
import { useWebSocket } from '../../hooks/useWebSocket'
import { listScripts, getConfig, updateModel } from '../../api/client'
import type { ChatMessage, ToolCall, WSMessage } from '../../types'

interface ChatPanelProps {
  sessionId: string
  onAgentNavigate?: (url: string) => void
  /** Ref that parent can use to programmatically send a message */
  sendRef?: React.MutableRefObject<((text: string) => void) | null>
  onOpenSettings?: () => void
}

// 每个服务商的推荐模型
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


function ToolCallCard({ tool }: { tool: ToolCall }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const statusIcon = {
    pending: <Loader2 size={13} className="animate-spin text-yellow-400" />,
    running: <Loader2 size={13} className="animate-spin text-blue-400" />,
    done: <CheckCircle size={13} className="text-green-400" />,
    error: <XCircle size={13} className="text-red-600 dark:text-red-400" />,
  }[tool.status]

  return (
    <div className="mt-1.5 rounded-lg border border-nb-border bg-nb-card/60 text-xs overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-nb-raised/40 transition-colors"
      >
        {statusIcon}
        <Terminal size={12} className="text-nb-text-dim" />
        <span className="font-mono text-brand-400 font-medium">{tool.name}</span>
        <span className="text-nb-text-muted flex-1">({Object.keys(tool.args).join(', ')})</span>
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {expanded && (
        <div className="border-t border-nb-border px-3 py-2 space-y-2">
          <div>
            <p className="text-nb-text-muted mb-1 uppercase tracking-wide" style={{ fontSize: 10 }}>{t('chat.toolArgs')}</p>
            <pre className="text-nb-text-soft whitespace-pre-wrap break-all font-mono" style={{ fontSize: 11 }}>
              {JSON.stringify(tool.args, null, 2)}
            </pre>
          </div>
          {tool.result !== undefined && (
            <div>
              <p className="text-nb-text-muted mb-1 uppercase tracking-wide" style={{ fontSize: 10 }}>{t('chat.toolResult')}</p>
              <pre className="text-nb-text-soft whitespace-pre-wrap break-all font-mono" style={{ fontSize: 11 }}>
                {tool.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center mt-0.5">
          <Bot size={14} />
        </div>
      )}
      <div className={`max-w-[85%] ${isUser ? 'order-first' : ''}`}>
        <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser ? 'bg-brand-600 text-white rounded-tr-sm' : 'bg-nb-card text-nb-text rounded-tl-sm border border-nb-border'
        }`}>
          {msg.content || (msg.role === 'assistant' && !msg.toolCalls?.length ? (
            <span className="inline-flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-nb-text-dim animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-nb-text-dim animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-nb-text-dim animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          ) : null)}
        </div>
        {msg.toolCalls?.map((tool) => <ToolCallCard key={tool.id} tool={tool} />)}
      </div>
      {isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-nb-raised flex items-center justify-center mt-0.5">
          <User size={14} />
        </div>
      )}
    </div>
  )
}

interface Script { id: string; name: string; prompt: string; icon: string }

// 模型选择器组件
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
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 获取当前模型的显示名称
  const getModelLabel = (model: string, provider: string) => {
    const presets = PRESET_MODELS[provider] || []
    const found = presets.find(p => p.value === model)
    if (found) return found.label
    // 截断长模型名
    return model.length > 15 ? model.slice(0, 15) + '...' : model
  }

  // 关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 获取当前配置的提供商的所有模型
  const availableModels = PRESET_MODELS[currentProvider] || []

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-0.5 px-2 py-1.5 rounded-md text-xs text-nb-text-dim hover:text-nb-text hover:bg-nb-hover transition-colors"
        title={t('chat.switchModel')}
      >
        <span className="max-w-[80px] truncate">{getModelLabel(currentModel, currentProvider)}</span>
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-48 bg-nb-card border border-nb-border rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="max-h-40 overflow-y-auto">
            {availableModels.map(m => (
              <button
                key={m.value}
                onClick={() => {
                  onSelect(m.value, currentProvider)
                  setOpen(false)
                }}
                className={`flex items-center gap-2 w-full px-3 py-2 text-left text-xs hover:bg-nb-raised transition-colors ${
                  currentModel === m.value ? 'text-brand-400 bg-nb-raised/50' : 'text-nb-text'
                }`}
              >
                {currentModel === m.value && <Check size={12} className="shrink-0" />}
                <span className={currentModel === m.value ? '' : 'ml-4'}>{m.label}</span>
              </button>
            ))}
            {availableModels.length === 0 && (
              <div className="px-3 py-2 text-xs text-nb-text-muted">
                {t('chat.noModelsConfigured')}
              </div>
            )}
          </div>
          <div className="border-t border-nb-border">
            <button
              onClick={() => {
                setOpen(false)
                onOpenSettings?.()
              }}
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

export default function ChatPanel({ sessionId, onAgentNavigate, sendRef, onOpenSettings }: ChatPanelProps) {
  const { t } = useTranslation()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [scripts, setScripts] = useState<Script[]>([])
  const [currentModel, setCurrentModel] = useState('')
  const [currentProvider, setCurrentProvider] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const streamingMsgIdRef = useRef<string | null>(null)
  const pendingToolsRef = useRef<Map<string, string>>(new Map())

  const { send, onMessage, status, reconnect } = useWebSocket(sessionId)

  // 加载配置
  const loadConfig = useCallback(async () => {
    try {
      const cfg = await getConfig()
      const raw = cfg.config as Record<string, unknown>
      const agents = raw?.agents as Record<string, unknown> | undefined
      const defaults = agents?.defaults as Record<string, unknown> | undefined
      setCurrentModel((defaults?.model as string) ?? '')
      setCurrentProvider((defaults?.provider as string) ?? '')
    } catch {}
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // 切换模型
  const handleModelChange = async (model: string, provider: string) => {
    try {
      await updateModel(model, provider)
      setCurrentModel(model)
    } catch {}
  }

  // When the Electron main process signals the backend is ready, force-reconnect
  useEffect(() => {
    const eAPI = (window as any).electronAPI
    if (!eAPI?.onBackendReady) return
    const off = eAPI.onBackendReady(() => reconnect())
    return () => off?.()
  }, [reconnect])

  useEffect(() => {
    listScripts().then(setScripts).catch(() => {})
  }, [])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  useEffect(() => {
    onMessage((msg: WSMessage) => {
      if (msg.type === 'token') {
        const token = msg.content ?? ''
        setMessages((prev) => {
          if (!streamingMsgIdRef.current) return prev
          return prev.map((m) => m.id === streamingMsgIdRef.current ? { ...m, content: m.content + token } : m)
        })
      } else if (msg.type === 'tool_call') {
        const toolCall: ToolCall = {
          id: msg.call_id ?? Math.random().toString(36).slice(2),
          name: msg.name ?? '', args: msg.args ?? {}, status: 'running',
        }
        // Notify parent when agent navigates the browser
        if (toolCall.name === 'browser_navigate' && toolCall.args.url) {
          onAgentNavigate?.(toolCall.args.url as string)
        }
        setMessages((prev) => {
          if (!streamingMsgIdRef.current) return prev
          const msgId = streamingMsgIdRef.current
          pendingToolsRef.current.set(toolCall.id, msgId)
          return prev.map((m) => m.id === msgId ? { ...m, toolCalls: [...(m.toolCalls ?? []), toolCall] } : m)
        })
      } else if (msg.type === 'tool_result') {
        const callId = msg.call_id ?? ''
        const msgId = pendingToolsRef.current.get(callId)
        if (msgId) {
          setMessages((prev) => prev.map((m) => m.id === msgId ? {
            ...m, toolCalls: m.toolCalls?.map((t) => t.id === callId ? { ...t, result: String(msg.content ?? ''), status: 'done' } : t),
          } : m))
        }
      } else if (msg.type === 'done') {
        setIsStreaming(false); streamingMsgIdRef.current = null; pendingToolsRef.current.clear()
      } else if (msg.type === 'error') {
        setIsStreaming(false); streamingMsgIdRef.current = null
        setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: `错误：${msg.content ?? '未知错误'}`, createdAt: Date.now() }])
      } else if (msg.type === 'history_cleared') {
        setMessages([])
      }
    })
  }, [onMessage])

  const sendMessage = useCallback((overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if (!text || isStreaming || status !== 'connected') return
    const userMsgId = `user-${Date.now()}`
    const assistantMsgId = `assistant-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: text, createdAt: Date.now() },
      { id: assistantMsgId, role: 'assistant', content: '', toolCalls: [], createdAt: Date.now() },
    ])
    streamingMsgIdRef.current = assistantMsgId
    setIsStreaming(true)
    if (!overrideText) setInput('')
    send({ type: 'chat', content: text })
  }, [input, isStreaming, status, send])

  // Expose sendMessage to parent via ref
  useEffect(() => {
    if (sendRef) sendRef.current = (text: string) => sendMessage(text)
  }, [sendRef, sendMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送，Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(undefined)
    }
  }, [sendMessage])

  // 自动调整输入框高度
  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      const newHeight = Math.min(textarea.scrollHeight, 128) // 最大 128px (约 6 行)
      textarea.style.height = `${newHeight}px`
    }
  }, [])

  useEffect(() => {
    adjustTextareaHeight()
  }, [input, adjustTextareaHeight])

  const clearHistory = () => { send({ type: 'clear_history' }); setMessages([]) }

  return (
    <div className="flex flex-col h-full bg-nb-base rounded-xl border border-nb-border overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-nb-border bg-nb-card">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-brand-400" />
          <span className="font-semibold text-sm">{t('chat.title')}</span>
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

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-nb-text-muted">
            <Bot size={40} className="opacity-30" />
            <p className="text-sm">{t('chat.empty')}</p>
            <p className="text-xs opacity-70">{t('chat.emptyHint')}</p>
          </div>
        )}
        {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
        <div ref={bottomRef} />
      </div>

      {/* 快捷脚本栏 */}
      {scripts.length > 0 && (
        <div className="flex gap-1.5 px-3 py-2 border-t border-nb-border overflow-x-auto scrollbar-none">
          <Zap size={12} className="text-nb-text-muted shrink-0 mt-0.5" />
          {scripts.map(s => (
            <button
              key={s.id}
              onClick={() => sendMessage(s.prompt)}
              disabled={isStreaming || status !== 'connected'}
              title={s.prompt}
              className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full border border-nb-border bg-nb-card hover:border-brand-500 hover:bg-brand-500/10 text-nb-text-dim hover:text-brand-500 disabled:opacity-40 text-[11px] transition-colors"
            >
              <span>{s.icon}</span>
              <span>{s.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* 输入框 */}
      <div className="px-3 py-3 border-t border-nb-border bg-nb-card">
        <div className="flex items-end gap-2 bg-nb-raised rounded-xl px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.placeholder')}
            rows={1}
            disabled={status !== 'connected'}
            className="flex-1 bg-transparent text-sm text-nb-text placeholder:text-nb-text-muted outline-none resize-none max-h-32 scrollbar-thin disabled:opacity-50 leading-relaxed"
          />
          {/* 模型选择器 */}
          {currentModel && (
            <ModelSelector
              currentModel={currentModel}
              currentProvider={currentProvider}
              onSelect={handleModelChange}
              onOpenSettings={onOpenSettings}
            />
          )}
          <button onClick={() => sendMessage(undefined)}
            disabled={!input.trim() || isStreaming || status !== 'connected'}
            className="shrink-0 p-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <p className="text-xs text-nb-text-muted mt-1.5 pl-1">
          {t('chat.hint')}
        </p>
      </div>
    </div>
  )
}
