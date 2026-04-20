import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Trash2, Bot, User, ChevronDown, XCircle, Loader2, Wifi, WifiOff, Zap, ChevronUp, Check, Settings, Copy, Square, Edit2, Plus, X, Paperclip } from 'lucide-react'
import MarkdownRenderer from '../common/MarkdownRenderer'
import { listScripts, getConfig, updateModel, getProviders, createScript, updateScript, deleteScript } from '../../api/client'
import type { ChatMessage, ChatSession } from '../../types'
import { MessageAttachments, InputAttachments } from '../AttachmentsAdapter'
import { ToolCallsGroup } from '../ToolCallsGroup'
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from '@/components/ai-elements/reasoning'

interface ChatPanelProps {
  sessionId: string
  sessions: ChatSession[]
  currentSessionId: string
  messagesBySession?: Record<string, ChatMessage[]>
  onSwitchSession: (id: string) => void
  onNewSession: () => void
  onRenameSession: (id: string, name: string) => void
  onDeleteSession: (id: string) => void
  /** Ref that parent can use to programmatically send a message */
  sendRef?: React.MutableRefObject<((text: string) => void) | null>
  /** Ref that parent can use to set input text */
  externalInputRef?: React.MutableRefObject<((text: string) => void) | null>
  onOpenSettings?: () => void
  /** Called when messages change (for persistence) */
  onMessagesChange?: (messagesBySession: Record<string, ChatMessage[]>) => void
  /** Legacy: called when sessions or messages change */
  onSessionsChange?: (sessions: ChatSession[], messagesBySession: Record<string, ChatMessage[]>) => void
  /** Shared WebSocket props from parent */
  send: (data: unknown) => void
  wsStatus: 'connecting' | 'connected' | 'disconnected' | 'error'
  reconnectWS: () => void
  isStreaming: boolean
  onStartStreaming: (msgId: string) => void
  onStopStreaming: () => void
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

// 默认脚本（与后端 _DEFAULTS 保持一致）
const DEFAULT_SCRIPTS: Script[] = [
  { id: 'default-1', name: '总结页面', prompt: '请总结当前浏览器页面的主要内容（使用 browser_get_page_content 工具）', icon: '📝' },
  { id: 'default-2', name: '截图分析', prompt: '请截取当前页面截图并描述你看到的内容', icon: '📸' },
  { id: 'default-3', name: '提取链接', prompt: '请列出当前页面上所有重要链接', icon: '🔗' },
  { id: 'default-4', name: '翻译页面', prompt: '请将当前页面的主要内容翻译成中文（使用 browser_get_page_content 工具读取）', icon: '🌐' },
  { id: 'default-5', name: '填写表单', prompt: '请帮我查看当前页面有哪些表单字段，并提示我如何填写', icon: '📋' },
  { id: 'default-6', name: '分析所有标签页', prompt: '请分析我当前打开的所有标签页，帮我总结关键信息、比较不同来源的观点，并给出综合见解', icon: '📑' },
]


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

  // 格式化时间戳
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    if (isToday) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  // 判断是否正在推理中
  const isReasoningStreaming = Boolean(isStreaming && msg.reasoning && !msg.content)

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center mt-0.5 shadow-lg shadow-brand-500/20">
          <Bot size={15} className="text-white" />
        </div>
      )}
      <div className={`max-w-[85%] ${isUser ? 'order-first' : ''}`}>
        {/* Reasoning 推理过程 - 使用 AI SDK Elements */}
        {!isUser && msg.reasoning && (
          <Reasoning
            isStreaming={isReasoningStreaming}
            className="mb-2"
          >
            <ReasoningTrigger />
            <ReasoningContent>{msg.reasoning}</ReasoningContent>
          </Reasoning>
        )}

        {/* 消息内容气泡 */}
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
              {/* 改进的加载动画 */}
              <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '120ms' }} />
              <span className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '240ms' }} />
            </span>
          )}
          {/* AI 消息使用 Markdown 渲染 */}
          {msg.content && !isUser && (
            <div className="select-text">
              <MarkdownRenderer content={msg.content} />
            </div>
          )}
          {/* 用户消息：文本 + DOM 元素标签 */}
          {isUser && (
            <div className="select-text">
              {msg.content && <div className="whitespace-pre-wrap">{msg.content}</div>}
              {/* DOM 元素标签 */}
              {msg.domElements && msg.domElements.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {msg.domElements.map((el, idx) => (
                    <span
                      key={el.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/20 text-white text-xs font-medium"
                      title={el.selector}
                    >
                      <span className="text-[10px] opacity-80">#{idx + 1}</span>
                      <span className="uppercase">{el.tagName}</span>
                      {el.text && <span className="opacity-80 truncate max-w-[100px]">{el.text}</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* 用户消息的附件图片 - 使用 AI SDK Elements */}
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
        {/* 时间戳 */}
        {msg.createdAt && (
          <p className={`text-[10px] text-nb-text-muted mt-1 ${isUser ? 'text-right' : 'text-left'} px-1`}>
            {formatTime(msg.createdAt)}
          </p>
        )}
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="mt-2">
            <ToolCallsGroup tools={msg.toolCalls} />
          </div>
        )}
      </div>
      {isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-nb-raised to-nb-hover flex items-center justify-center mt-0.5 shadow-sm">
          <User size={15} className="text-nb-text-soft" />
        </div>
      )}
    </div>
  )
}

interface Script { id: string; name: string; prompt: string; icon: string }

// 脚本编辑模态框
function ScriptEditorModal({
  scripts,
  onClose,
  onSave,
}: {
  scripts: Script[]
  onClose: () => void
  onSave: (scripts: Script[]) => void
}) {
  const [editingScripts, setEditingScripts] = useState<Script[]>(scripts)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', prompt: '', icon: '' })
  const [saving, setSaving] = useState(false)

  const handleAdd = () => {
    setEditingId('new')
    setEditForm({ name: '', prompt: '', icon: '⚡' })
  }

  const handleEdit = (script: Script) => {
    setEditingId(script.id)
    setEditForm({ name: script.name, prompt: script.prompt, icon: script.icon })
  }

  const handleSaveEdit = async () => {
    if (!editForm.name.trim() || !editForm.prompt.trim()) return
    setSaving(true)

    try {
      if (editingId === 'new') {
        const newScript = await createScript(editForm.name, editForm.prompt, editForm.icon)
        const updated = [...editingScripts, newScript]
        setEditingScripts(updated)
        onSave(updated)
      } else if (typeof editingId === 'string') {
        await updateScript(editingId, editForm)
        const updated = editingScripts.map(s =>
          s.id === editingId ? { ...s, ...editForm } : s
        )
        setEditingScripts(updated)
        onSave(updated)
      }
      setEditingId(null)
    } catch (err) {
      console.error('Failed to save script:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这个快捷指令吗？')) return
    try {
      await deleteScript(id)
      const updated = editingScripts.filter(s => s.id !== id)
      setEditingScripts(updated)
      onSave(updated)
    } catch (err) {
      console.error('Failed to delete script:', err)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-nb-card border border-nb-border rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-nb-border">
          <h3 className="font-semibold text-sm">编辑快捷指令</h3>
          <button onClick={onClose} className="text-nb-text-dim hover:text-nb-text">
            <XCircle size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-60 overflow-y-auto">
          {editingScripts.map(script => (
            <div key={script.id} className="flex items-center gap-2 p-2 bg-nb-raised rounded-lg">
              <span className="text-lg">{script.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-nb-text truncate">{script.name}</p>
                <p className="text-[10px] text-nb-text-dim truncate">{script.prompt}</p>
              </div>
              <button
                onClick={() => handleEdit(script)}
                className="p-1 text-nb-text-dim hover:text-nb-text"
              >
                <Edit2 size={12} />
              </button>
              <button
                onClick={() => handleDelete(script.id)}
                className="p-1 text-nb-text-dim hover:text-red-400"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* 编辑表单 */}
        {editingId && (
          <div className="p-4 border-t border-nb-border space-y-3 bg-nb-base">
            <div className="flex gap-2">
              <input
                value={editForm.icon}
                onChange={e => setEditForm(f => ({ ...f, icon: e.target.value }))}
                placeholder="图标"
                className="w-14 bg-nb-raised border border-nb-border rounded-lg px-2 py-1.5 text-center text-lg outline-none focus:border-brand-500"
              />
              <input
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                placeholder="名称"
                className="flex-1 bg-nb-raised border border-nb-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-brand-500"
              />
            </div>
            <textarea
              value={editForm.prompt}
              onChange={e => setEditForm(f => ({ ...f, prompt: e.target.value }))}
              placeholder="提示词内容..."
              rows={3}
              className="w-full bg-nb-raised border border-nb-border rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingId(null)}
                className="px-3 py-1.5 text-xs text-nb-text-dim hover:text-nb-text"
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editForm.name.trim() || !editForm.prompt.trim() || saving}
                className="px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-500 text-white rounded-lg disabled:opacity-40"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        )}

        {/* 添加按钮 */}
        {!editingId && (
          <div className="p-4 border-t border-nb-border">
            <button
              onClick={handleAdd}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-nb-text-dim hover:text-nb-text hover:bg-nb-raised rounded-lg transition-colors"
            >
              <Plus size={14} />
              <span>添加快捷指令</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// 服务商显示名称
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

// 服务商配置类型
interface ProviderConfig {
  apiKey?: string
  apiBase?: string
  models?: { label: string; value: string }[]
}

// 模型选择器组件 - 按服务商分类显示模型（从配置读取）
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

  // 每次打开下拉菜单时重新加载配置（确保获取最新数据）
  useEffect(() => {
    if (!open) return

    getProviders()
      .then((res) => {
        setProviderConfigs(res.providers || {})
      })
      .catch(() => {
        setProviderConfigs({})
      })
  }, [open])

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

  // 获取已配置的服务商列表（存在配置即显示，不再过滤 apiKey）
  const configuredProviders = Object.keys(providerConfigs)

  // 获取服务商的模型列表（优先使用配置的，否则用预设）
  const getProviderModels = (provider: string) => {
    const config = providerConfigs[provider]
    if (config?.models && config.models.length > 0) {
      return config.models
    }
    return PRESET_MODELS[provider] || []
  }

  // 获取当前模型的显示名称
  const getModelLabel = (model: string, provider: string) => {
    if (!model) return t('chat.selectModel') || '选择模型'
    // 如果有 provider，尝试从对应服务商获取模型名称
    if (provider) {
      const models = getProviderModels(provider)
      const found = models.find(p => p.value === model)
      if (found) return found.label
    }
    // 如果找不到，尝试在所有预设模型中查找
    for (const p of Object.keys(PRESET_MODELS)) {
      const models = PRESET_MODELS[p]
      const found = models?.find(m => m.value === model)
      if (found) return found.label
    }
    // 如果都找不到，返回原始值（可能来自后端配置）
    return model.length > 20 ? model.slice(0, 20) + '...' : model
  }

  // 判断当前模型是否选中
  const isSelected = (model: string, provider: string) => {
    return currentModel === model && currentProvider === provider
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-0.5 px-2 py-1.5 rounded-md text-xs text-nb-text-dim hover:text-nb-text hover:bg-nb-hover transition-colors"
        title={t('chat.switchModel')}
      >
        <span className="max-w-[100px] truncate">{getModelLabel(currentModel, currentProvider)}</span>
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-60 bg-nb-card border border-nb-border rounded-lg shadow-xl z-50 overflow-hidden">
          {configuredProviders.length === 0 ? (
            // 未配置任何服务商时的提示
            <div className="p-4 text-center">
              <p className="text-xs text-nb-text-muted mb-2">{t('chat.noProvidersConfigured') || '尚未配置服务商'}</p>
              <button
                onClick={() => {
                  setOpen(false)
                  onOpenSettings?.()
                }}
                className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                {t('chat.configureModels')}
              </button>
            </div>
          ) : (
            // 按服务商分类显示模型（全部展开，无需点击）
            <div className="max-h-64 overflow-y-auto">
              {configuredProviders.map(provider => {
                const models = getProviderModels(provider)
                if (models.length === 0) return null

                return (
                  <div key={provider} className="border-b border-nb-border last:border-b-0">
                    {/* 服务商标题 */}
                    <div className="px-3 py-1.5 text-[10px] text-nb-text-muted uppercase tracking-wider bg-nb-raised/30">
                      {PROVIDER_LABELS[provider] || provider}
                    </div>
                    {/* 模型列表 */}
                    {models.map(model => (
                      <button
                        key={model.value}
                        onClick={() => {
                          onSelect(model.value, provider)
                          setOpen(false)
                        }}
                        className={`flex items-center gap-2 w-full px-3 py-2 text-left text-xs transition-colors ${
                          isSelected(model.value, provider)
                            ? 'text-brand-400 bg-brand-500/10'
                            : 'text-nb-text-dim hover:text-nb-text hover:bg-nb-raised'
                        }`}
                      >
                        {isSelected(model.value, provider) ? (
                          <Check size={12} className="shrink-0" />
                        ) : (
                          <span className="w-3" />
                        )}
                        <span>{model.label}</span>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          )}

          {/* 设置入口 */}
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

interface Script { id: string; name: string; prompt: string; icon: string }

export default function ChatPanel({
  sessionId,
  sessions,
  currentSessionId,
  messagesBySession: propMessagesBySession,
  onSwitchSession,
  onNewSession,
  onRenameSession,
  onDeleteSession,
  sendRef,
  externalInputRef,
  onOpenSettings,
  onMessagesChange,
  send,
  wsStatus,
  reconnectWS,
  isStreaming,
  onStartStreaming,
  onStopStreaming,
}: ChatPanelProps) {
  const { t } = useTranslation()
  const messages = propMessagesBySession?.[sessionId] ?? []
  const [input, setInput] = useState('')
  // 使用默认脚本确保立即显示，后端就绪后尝试更新
  const [scripts, setScripts] = useState<Script[]>(DEFAULT_SCRIPTS)
  const [currentModel, setCurrentModel] = useState('')
  const [currentProvider, setCurrentProvider] = useState('')
  const [showScriptEditor, setShowScriptEditor] = useState(false)
  const [showSessionPanel, setShowSessionPanel] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; data: string; type: string }[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isDomPicking, setIsDomPicking] = useState(false)
  const [pickedElements, setPickedElements] = useState<Array<{id: string; tagName: string; text: string; selector: string}>>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scriptsScrollRef = useRef<HTMLDivElement>(null)
  const sessionPanelRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef(propMessagesBySession || {})
  useEffect(() => { messagesRef.current = propMessagesBySession || {} }, [propMessagesBySession])

  // 切换会话时清空已选取的 DOM 元素
  useEffect(() => {
    setPickedElements([])
  }, [sessionId])

  // 加载配置（可重复调用，用于后端就绪后重新加载）
  const loadConfig = useCallback(async () => {
    try {
      const cfg = await getConfig()
      const raw = cfg.config as Record<string, unknown>
      const agents = raw?.agents as Record<string, unknown> | undefined
      const defaults = agents?.defaults as Record<string, unknown> | undefined
      let model = (defaults?.model as string) ?? ''
      let provider = (defaults?.provider as string) ?? ''
      console.log('[ChatPanel] loadConfig:', { model, provider, raw })
      // 如果没有配置模型但有预设模型，使用第一个预设模型作为默认值
      if (!model && Object.keys(PRESET_MODELS).length > 0) {
        const firstProvider = Object.keys(PRESET_MODELS)[0]
        const firstModel = PRESET_MODELS[firstProvider][0]
        model = firstModel.value
        provider = firstProvider
      }
      setCurrentModel(model)
      setCurrentProvider(provider)
    } catch (e) {
      console.error('[ChatPanel] loadConfig error:', e)
    }
  }, [])

  // 加载脚本（可重复调用）
  const loadScripts = useCallback(async () => {
    try {
      const serverScripts = await listScripts()
      const hasCustomScripts = serverScripts.some(s => !s.id.startsWith('default-'))
      if (hasCustomScripts || serverScripts.length > DEFAULT_SCRIPTS.length) {
        setScripts(serverScripts)
      }
    } catch {}
  }, [])

  // DOM 元素选取功能
  useEffect(() => {
    const eAPI = (window as any).electronAPI
    if (!eAPI?.onDomPicked) return

    const unsubscribe = eAPI.onDomPicked((data: any) => {
      setIsDomPicking(false)
      // data 为 null 时表示右键取消了选取
      if (!data) return
      // 添加选中的元素到列表
      setPickedElements(prev => {
        const newElement = {
          id: `dom-${Date.now()}`,
          tagName: data.tagName,
          text: data.text?.slice(0, 30) || '',
          selector: data.selector
        }
        return [...prev, newElement]
      })
    })

    return () => unsubscribe()
  }, [])

  const startDomPicker = async () => {
    const eAPI = (window as any).electronAPI
    if (!eAPI?.startDomPicker) {
      console.error('DOM picker not available')
      return
    }
    try {
      setIsDomPicking(true)
      const result = await eAPI.startDomPicker()
      if (!result?.ok) {
        console.error('Failed to start DOM picker:', result?.error)
        setIsDomPicking(false)
        // 可以在这里添加 toast 提示
        alert(result?.error || '无法启动元素选择器，请确保已打开网页')
      }
    } catch (err) {
      console.error('Failed to start DOM picker:', err)
      setIsDomPicking(false)
    }
  }

  const stopDomPicker = async () => {
    const eAPI = (window as any).electronAPI
    if (!eAPI?.stopDomPicker) return
    try {
      await eAPI.stopDomPicker()
      setIsDomPicking(false)
    } catch (err) {
      console.error('Failed to stop DOM picker:', err)
    }
  }

  const removePickedElement = async (id: string) => {
    const eAPI = (window as any).electronAPI
    // 找到元素的索引（1-based）
    const index = pickedElements.findIndex(el => el.id === id)
    if (index !== -1 && eAPI?.removePickedBadge) {
      // 通知主进程移除网页上对应的 badge
      await eAPI.removePickedBadge(index + 1)
    }
    setPickedElements(prev => prev.filter(el => el.id !== id))
  }

  // 开发环境：立即加载；生产环境：等待 backend:ready
  useEffect(() => {
    const eAPI = (window as any).electronAPI

    // 开发环境（无 electronAPI）或后端已就绪：立即加载
    if (!eAPI?.onBackendReady) {
      loadConfig()
      loadScripts()
      return
    }

    // 生产环境：等待 backend:ready 事件，同时设置超时 fallback
    const timeout = setTimeout(() => {
      loadConfig()
      loadScripts()
    }, 3000) // 3秒超时 fallback

    const off = eAPI.onBackendReady(() => {
      clearTimeout(timeout)
      loadConfig()
      loadScripts()
    })
    return () => {
      clearTimeout(timeout)
      off?.()
    }
  }, [loadConfig, loadScripts])

  // 脚本栏横向滚动：使用非被动事件监听器避免 preventDefault 警告
  useEffect(() => {
    const el = scriptsScrollRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      el.scrollLeft += e.deltaY
      e.preventDefault()
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // 切换模型
  const handleModelChange = async (model: string, provider: string) => {
    try {
      await updateModel(model, provider)
      setCurrentModel(model)
      setCurrentProvider(provider)
    } catch {}
  }

  // When the Electron main process signals the backend is ready, force-reconnect WebSocket
  useEffect(() => {
    const eAPI = (window as any).electronAPI
    if (!eAPI?.onBackendReady) return
    const off = eAPI.onBackendReady(() => reconnectWS())
    return () => off?.()
  }, [reconnectWS])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages.length, scrollToBottom])

  const sendMessage = useCallback((overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if ((!text && attachedFiles.length === 0 && pickedElements.length === 0) || isStreaming || wsStatus !== 'connected') return
    const userMsgId = `user-${Date.now()}`
    const assistantMsgId = `assistant-${Date.now()}`

    // 用户消息内容（纯文本）
    let displayContent = text || ''

    // 发送给 AI 的内容：包含选择器和工具使用说明
    let aiContent = text || ''
    if (pickedElements.length > 0) {
      const selectors = pickedElements.map((el, idx) =>
        `[选中元素 #${idx + 1}]: ${el.selector}`
      ).join('\n')
      const toolHint = '\n\n使用 `browser_get_text` 工具并传入上述 @N 格式选择器来获取元素内容。例如：browser_get_text(selector="@123456")'
      aiContent = aiContent ? `${aiContent}\n\n${selectors}${toolHint}` : `${selectors}${toolHint}`
    }

    if (!displayContent && attachedFiles.length > 0) {
      displayContent = `[上传了 ${attachedFiles.length} 个文件]`
    }
    if (!aiContent && attachedFiles.length > 0) {
      aiContent = `[上传了 ${attachedFiles.length} 个文件]`
    }

    const nextMsgs: Record<string, ChatMessage[]> = {
      ...messagesRef.current,
      [sessionId]: [...(messagesRef.current[sessionId] ?? []),
        { id: userMsgId, role: 'user' as const, content: displayContent, files: attachedFiles, domElements: [...pickedElements], createdAt: Date.now() },
        { id: assistantMsgId, role: 'assistant' as const, content: '', reasoning: '', toolCalls: [], createdAt: Date.now() },
      ]
    }
    onMessagesChange?.(nextMsgs)
    onStartStreaming(assistantMsgId)
    setInput('')
    setAttachedFiles([])
    // 发送后清空选中的 DOM 元素并同步清除网页上的 badges
    const eAPI = (window as any).electronAPI
    if (eAPI?.clearAllPickedBadges) {
      eAPI.clearAllPickedBadges().catch(() => {})
    }
    setPickedElements([])
    send({ type: 'chat', content: aiContent, files: attachedFiles.length > 0 ? attachedFiles : undefined })
  }, [input, isStreaming, wsStatus, send, attachedFiles, pickedElements, onMessagesChange, onStartStreaming, sessionId])

  // Expose sendMessage to parent via ref
  useEffect(() => {
    if (sendRef) sendRef.current = (text: string) => sendMessage(text)
  }, [sendRef, sendMessage])

  // Expose setInput to parent via ref
  useEffect(() => {
    if (externalInputRef) externalInputRef.current = (text: string) => setInput(text)
  }, [externalInputRef])

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
      // In Electron, during panel show/resize the textarea may momentarily report scrollHeight=0.
      // Guard with a reasonable minimum height so the input never collapses.
      const measured = textarea.scrollHeight || 0
      const newHeight = Math.min(Math.max(measured, 48), 128) // min ~2-3 lines, max 128px
      textarea.style.height = `${newHeight}px`
    }
  }, [])

  useEffect(() => {
    adjustTextareaHeight()
  }, [input, adjustTextareaHeight])

  const clearHistory = () => { send({ type: 'clear_history' }); onMessagesChange?.({ ...messagesRef.current, [sessionId]: [] }) }

  // 文件上传处理
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const data = ev.target?.result as string
        setAttachedFiles(prev => [...prev, {
          name: file.name,
          data,
          type: file.type
        }])
      }
      reader.readAsDataURL(file)
    })

    // 清空 input 以允许重复选择同一文件
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const removeAttachedFile = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  // 拖拽上传处理
  const dragCounterRef = useRef(0)

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
    // 必须设置 dropEffect 才能让 drop 事件触发
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragging(false)

    if (wsStatus !== 'connected') return

    const files = e.dataTransfer.files
    if (!files || files.length === 0) return

    // 支持的文件扩展名
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.txt', '.xlsx', '.xls']

    Array.from(files).forEach(file => {
      // 检查文件类型（通过 MIME 类型或扩展名）
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
        console.warn('[ChatPanel] 不支持的文件类型:', file.type, file.name)
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
  }, [wsStatus])

  // 右键菜单处理
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
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

  // 停止生成
  const stopGeneration = () => {
    send({ type: 'stop' })
    onStopStreaming()
  }

  // 点击外部关闭会话面板
  useEffect(() => {
    if (!showSessionPanel) return
    const handleClickOutside = (e: MouseEvent) => {
      if (sessionPanelRef.current && !sessionPanelRef.current.contains(e.target as Node)) {
        setShowSessionPanel(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showSessionPanel])

  return (
    <div
      className="flex flex-col h-full bg-nb-base rounded-xl border border-nb-border overflow-hidden relative"
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

      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-nb-border bg-nb-card">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-brand-400" />
          {/* 会话选择器 */}
          <div className="relative" ref={sessionPanelRef}>
            <button
              onClick={() => setShowSessionPanel(!showSessionPanel)}
              className="flex items-center gap-1.5 text-sm font-semibold text-nb-text hover:text-brand-400 transition-colors"
            >
              <span className="max-w-[120px] truncate">
                {sessions.find(s => s.id === currentSessionId)?.name || '会话'}
              </span>
              <ChevronDown size={14} className={`transition-transform ${showSessionPanel ? 'rotate-180' : ''}`} />
            </button>

            {showSessionPanel && (
              <div className="absolute left-0 top-full mt-1 w-56 max-h-[60vh] bg-nb-base border border-nb-border rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-nb-border">
                  <span className="text-xs font-medium text-nb-text-muted">会话列表</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {sessions.map(session => (
                    <div
                      key={session.id}
                      className={`flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
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
                            if (editingName.trim()) {
                              onRenameSession(session.id, editingName.trim())
                            }
                            setEditingSessionId(null)
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              if (editingName.trim()) {
                                onRenameSession(session.id, editingName.trim())
                              }
                              setEditingSessionId(null)
                            }
                          }}
                          className="flex-1 bg-nb-card border border-nb-border rounded px-1.5 py-1 text-xs outline-none focus:border-brand-500"
                          autoFocus
                        />
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              onSwitchSession(session.id)
                              setShowSessionPanel(false)
                            }}
                            className="flex-1 text-left text-xs truncate"
                          >
                            {session.name}
                          </button>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setEditingSessionId(session.id)
                                setEditingName(session.name)
                              }}
                              className="p-1 rounded text-nb-text-dim hover:text-nb-text hover:bg-nb-hover transition-colors"
                            >
                              <Edit2 size={10} />
                            </button>
                            {sessions.length > 1 && (
                              <button
                                onClick={() => onDeleteSession(session.id)}
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
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-nb-text-dim">
            {wsStatus === 'connected'
              ? <Wifi size={12} className="text-green-400" />
              : <WifiOff size={12} className="text-red-600 dark:text-red-400" />}
            <span>{t(`chat.status.${wsStatus}`) || wsStatus}</span>
          </div>
          <button onClick={clearHistory} title={t('chat.clearHistory')}
            className="p-1.5 rounded hover:bg-nb-raised text-nb-text-dim hover:text-nb-text transition-colors">
            <Trash2 size={14} />
          </button>
          <button onClick={onNewSession} title="新建会话"
            className="p-1.5 rounded hover:bg-nb-raised text-nb-text-dim hover:text-nb-text transition-colors">
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* 消息列表 */}
      <div className={`flex-1 p-4 ${messages.length > 0 ? 'overflow-y-auto space-y-4 scrollbar-thin' : 'overflow-hidden'}`}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-nb-text-muted">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-brand-500/20 to-brand-600/20 rounded-full blur-xl" />
              <Bot size={48} className="relative text-brand-400/60" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-nb-text-soft">{t('chat.empty')}</p>
              <p className="text-xs text-nb-text-muted max-w-[200px]">{t('chat.emptyHint')}</p>
            </div>
            {/* 快捷操作提示 */}
            <div className="flex gap-2 mt-2">
              {scripts.slice(0, 3).map(s => (
                <button
                  key={s.id}
                  onClick={() => sendMessage(s.prompt)}
                  disabled={isStreaming || wsStatus !== 'connected'}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-nb-border/50 bg-nb-card/50 text-[11px] text-nb-text-dim hover:text-brand-500 hover:border-brand-500/30 transition-all duration-150"
                >
                  <span>{s.icon}</span>
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, index) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isStreaming={isStreaming && index === messages.length - 1}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 快捷脚本栏 */}
      {scripts.length > 0 && (
        <div className="flex gap-2 px-3 py-2 border-t border-nb-border items-center group bg-nb-card/50">
          <Zap size={13} className="text-brand-500 shrink-0" />
          <div ref={scriptsScrollRef} className="scripts-scroll flex gap-1.5 overflow-x-auto scrollbar-thin scrollbar-h-1 group-hover:scrollbar-h-1.5 transition-all">
            {scripts.map(s => (
              <button
                key={s.id}
                onClick={() => sendMessage(s.prompt)}
                disabled={isStreaming || wsStatus !== 'connected'}
                title={s.prompt}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-nb-border/60 bg-gradient-to-br from-nb-card to-nb-raised/50 hover:from-brand-500/10 hover:to-brand-500/5 hover:border-brand-500/50 hover:shadow-sm hover:shadow-brand-500/10 text-nb-text-soft hover:text-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-[11px] transition-all duration-150 active:scale-95"
              >
                <span className="text-[13px]">{s.icon}</span>
                <span className="font-medium">{s.name}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowScriptEditor(true)}
            className="shrink-0 p-1.5 rounded-lg text-nb-text-muted hover:text-brand-500 hover:bg-brand-500/10 transition-all duration-150"
            title="编辑快捷指令"
          >
            <Edit2 size={12} />
          </button>
        </div>
      )}

      {/* 脚本编辑模态框 */}
      {showScriptEditor && (
        <ScriptEditorModal
          scripts={scripts}
          onClose={() => setShowScriptEditor(false)}
          onSave={setScripts}
        />
      )}

      {/* 输入框 - 上下布局 */}
      <div className="px-3 py-3 border-t border-nb-border bg-gradient-to-t from-nb-card to-nb-card/80">
        {/* 选中的 DOM 元素显示 */}
        {pickedElements.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {pickedElements.map((el, index) => (
              <div
                key={el.id}
                className="group flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-br from-brand-500/10 to-brand-600/5 border border-brand-500/30 hover:border-brand-500/50 transition-all cursor-default"
              >
                {/* 小角标 */}
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-md bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center text-white text-[10px] font-bold shadow-sm">
                    #{index + 1}
                  </div>
                  <span className="text-xs font-medium text-brand-400">&lt;{el.tagName}&gt;</span>
                </div>
                {/* 元素文本 */}
                <span className="text-xs text-nb-text-soft truncate max-w-[100px]">
                  {el.text || ''}
                </span>
                {/* 删除按钮 */}
                <button
                  onClick={() => removePickedElement(el.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-500/20 text-nb-text-dim hover:text-red-400 transition-all"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 附件预览 - 使用 AI SDK Elements */}
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
            disabled={wsStatus !== 'connected'}
            className="w-full bg-transparent text-sm text-nb-text placeholder:text-nb-text-muted outline-none resize-none max-h-32 scrollbar-thin disabled:opacity-50 leading-relaxed"
          />
        </div>

        {/* 功能按钮区域 - 下层 */}
        <div className="flex items-center justify-between mt-2 px-1">
          {/* 左侧：文件和工具按钮 */}
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={wsStatus !== 'connected'}
              className="shrink-0 p-1.5 rounded-lg text-nb-text-dim hover:text-brand-500 hover:bg-brand-500/10 transition-all duration-150 disabled:opacity-50"
              title="上传文件"
            >
              <Paperclip size={16} />
            </button>
            <button
              onClick={isDomPicking ? stopDomPicker : startDomPicker}
              disabled={wsStatus !== 'connected'}
              className={`shrink-0 p-1.5 rounded-lg transition-all duration-150 disabled:opacity-50 ${
                isDomPicking
                  ? 'text-brand-500 bg-brand-500/20 animate-pulse'
                  : 'text-nb-text-dim hover:text-brand-500 hover:bg-brand-500/10'
              }`}
              title={isDomPicking ? '点击取消选取' : '选取网页元素'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
                <path d="M13 13l9 9"/>
              </svg>
            </button>
          </div>

          {/* 右侧：模型选择和发送 */}
          <div className="flex items-center gap-2">
            {/* 模型选择器 */}
            <ModelSelector
              currentModel={currentModel}
              currentProvider={currentProvider}
              onSelect={handleModelChange}
              onOpenSettings={onOpenSettings}
            />

            {/* 发送/停止按钮 */}
            {isStreaming ? (
              <div className="relative group">
                <button
                  className="shrink-0 p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 transition-all"
                >
                  <Loader2 size={16} className="animate-spin text-amber-500" />
                </button>
                {/* hover 时显示停止按钮 */}
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
                disabled={!input.trim() || wsStatus !== 'connected'}
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
  )
}
