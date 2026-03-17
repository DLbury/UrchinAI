import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Trash2, Bot, User, ChevronDown, ChevronRight, Terminal, CheckCircle, XCircle, Loader2, Wifi, WifiOff, Zap, ChevronUp, Check, Settings, Copy, Square, Edit2, Plus, GripVertical } from 'lucide-react'
import { useWebSocket } from '../../hooks/useWebSocket'
import { listScripts, getConfig, updateModel, getProviders, createScript, updateScript, deleteScript } from '../../api/client'
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

// 默认脚本（与后端 _DEFAULTS 保持一致）
const DEFAULT_SCRIPTS: Script[] = [
  { id: 'default-1', name: '总结页面', prompt: '请总结当前浏览器页面的主要内容（使用 browser_get_page_content 工具）', icon: '📝' },
  { id: 'default-2', name: '截图分析', prompt: '请截取当前页面截图并描述你看到的内容', icon: '📸' },
  { id: 'default-3', name: '提取链接', prompt: '请列出当前页面上所有重要链接', icon: '🔗' },
  { id: 'default-4', name: '翻译页面', prompt: '请将当前页面的主要内容翻译成中文（使用 browser_get_page_content 工具读取）', icon: '🌐' },
  { id: 'default-5', name: '填写表单', prompt: '请帮我查看当前页面有哪些表单字段，并提示我如何填写', icon: '📋' },
]


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
  const [showCopy, setShowCopy] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (msg.content) {
      await navigator.clipboard.writeText(msg.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center mt-0.5">
          <Bot size={14} />
        </div>
      )}
      <div className={`max-w-[85%] ${isUser ? 'order-first' : ''}`}>
        <div
          className={`relative px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap select-text ${
            isUser ? 'bg-brand-600 text-white rounded-tr-sm' : 'bg-nb-card text-nb-text rounded-tl-sm border border-nb-border'
          }`}
          onMouseEnter={() => setShowCopy(true)}
          onMouseLeave={() => setShowCopy(false)}
        >
          {msg.content || (msg.role === 'assistant' && !msg.toolCalls?.length ? (
            <span className="inline-flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-nb-text-dim animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-nb-text-dim animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-nb-text-dim animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          ) : null)}
          {msg.content && showCopy && (
            <button
              onClick={handleCopy}
              className="absolute -right-2 -top-2 p-1 rounded bg-nb-raised border border-nb-border hover:bg-nb-hover transition-colors"
              title={copied ? '已复制' : '复制'}
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} className="text-nb-text-dim" />}
            </button>
          )}
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
      } else {
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

// 已知服务商列表
const KNOWN_PROVIDERS = [
  'openrouter', 'anthropic', 'openai', 'deepseek', 'gemini',
  'groq', 'minimax', 'moonshot', 'zhipu', 'dashscope',
  'volcengine', 'siliconflow', 'aihubmix', 'azure_openai', 'vllm', 'custom',
]

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
    const models = getProviderModels(provider)
    const found = models.find(p => p.value === model)
    if (found) return found.label
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

export default function ChatPanel({ sessionId, onAgentNavigate, sendRef, onOpenSettings }: ChatPanelProps) {
  const { t } = useTranslation()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  // 使用默认脚本确保立即显示，后端就绪后尝试更新
  const [scripts, setScripts] = useState<Script[]>(DEFAULT_SCRIPTS)
  const [currentModel, setCurrentModel] = useState('')
  const [currentProvider, setCurrentProvider] = useState('')
  const [showScriptEditor, setShowScriptEditor] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const streamingMsgIdRef = useRef<string | null>(null)
  const pendingToolsRef = useRef<Map<string, string>>(new Map())
  const scriptsScrollRef = useRef<HTMLDivElement>(null)

  const { send, onMessage, status, reconnect } = useWebSocket(sessionId)

  // 加载配置（可重复调用，用于后端就绪后重新加载）
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

  // 开发环境：立即加载；生产环境：等待 backend:ready
  useEffect(() => {
    const eAPI = (window as any).electronAPI

    // 开发环境（无 electronAPI）或后端已就绪：立即加载
    if (!eAPI?.onBackendReady) {
      loadConfig()
      loadScripts()
      return
    }

    // 生产环境：等待 backend:ready 事件
    const off = eAPI.onBackendReady(() => {
      loadConfig()
      loadScripts()
    })
    return () => off?.()
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
    const off = eAPI.onBackendReady(() => reconnect())
    return () => off?.()
  }, [reconnect])

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
        setIsStreaming(false); streamingMsgIdRef.current = null; pendingToolsRef.current.clear()
        setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: `错误：${msg.content ?? '未知错误'}`, createdAt: Date.now() }])
      } else if (msg.type === 'stopped') {
        setIsStreaming(false); streamingMsgIdRef.current = null; pendingToolsRef.current.clear()
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

  // 停止生成
  const stopGeneration = () => {
    send({ type: 'stop' })
    setIsStreaming(false)
    streamingMsgIdRef.current = null
    pendingToolsRef.current.clear()
  }

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
        <div className="flex gap-1.5 px-3 py-1.5 border-t border-nb-border items-center group">
          <Zap size={12} className="text-nb-text-muted shrink-0" />
          <div ref={scriptsScrollRef} className="scripts-scroll flex gap-1.5 overflow-x-auto scrollbar-thin scrollbar-h-1 group-hover:scrollbar-h-1.5 transition-all">
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
          <button
            onClick={() => setShowScriptEditor(true)}
            className="shrink-0 p-0.5 rounded-full text-nb-text-muted hover:text-nb-text hover:bg-nb-raised transition-colors"
            title="编辑快捷指令"
          >
            <Edit2 size={10} />
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
                className="shrink-0 p-1.5 rounded-lg bg-nb-card border border-nb-border transition-colors"
              >
                <Loader2 size={16} className="animate-spin text-brand-400" />
              </button>
              {/* hover 时显示停止按钮 */}
              <button
                onClick={stopGeneration}
                className="absolute inset-0 shrink-0 p-1.5 rounded-lg bg-nb-card border border-nb-border opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                title="停止生成"
              >
                <Square size={14} className="text-nb-text-dim" />
              </button>
            </div>
          ) : (
            <button onClick={() => sendMessage(undefined)}
              disabled={!input.trim() || status !== 'connected'}
              className="shrink-0 p-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <Send size={16} />
            </button>
          )}
        </div>
        <p className="text-xs text-nb-text-muted mt-1.5 pl-1">
          {t('chat.hint')}
        </p>
      </div>
    </div>
  )
}
