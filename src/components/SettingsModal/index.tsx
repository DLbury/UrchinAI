import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X, Settings, Save, Plus, Trash2, Eye, EyeOff,
  Loader2, CheckCircle, Puzzle, Server, Terminal,
  Globe, Edit2, Check, AlertCircle, ExternalLink, BookOpen, Brain, Sparkles,
  MousePointer2, Sun, Moon, Monitor, Bookmark,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../hooks/useTheme'
import {
  getConfig, updateModel, updateProvider, deleteProvider,
  listSkills, installSkill, deleteSkill,
  listMCPServers, addMCPServer, updateMCPServer, deleteMCPServer,
  listMemory, addMemory, deleteMemory, clearMemory,
  listCategories, addCategory, deleteCategory,
} from '../../api/client'

// ── 类型 ─────────────────────────────────────────────────────────────────────

type Tab = 'model' | 'skills' | 'mcp' | 'memory' | 'categories' | 'appearance'
type SaveState = 'idle' | 'saving' | 'saved'

interface ModelItem { label: string; value: string }
interface ProviderRow {
  name: string
  apiKey: string
  apiBase: string
  models: ModelItem[]
  showKey: boolean
  newModelLabel: string
  newModelValue: string
}
interface Skill { id: string; name: string; description: string }
interface MCPServer {
  name: string; type: string; command?: string; args?: string[]
  url?: string; headers?: Record<string, string>; toolTimeout?: number
}
interface CategoryInfo { id: string; name: string; name_en: string; icon: string }

// ── 常量 ─────────────────────────────────────────────────────────────────────

const MASKED = '••••••••'

const KNOWN_PROVIDERS = [
  'openrouter', 'anthropic', 'openai', 'deepseek', 'gemini',
  'groq', 'minimax', 'moonshot', 'zhipu', 'dashscope',
  'volcengine', 'siliconflow', 'aihubmix', 'azure_openai', 'vllm', 'custom',
]

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
    { label: 'Qwen Turbo', value: 'qwen-turbo' },
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

const FEATURED_SKILLS = [
  { name: 'GitHub', url: 'https://raw.githubusercontent.com/HKUDS/nanobot/main/nanobot/skills/github/skill.md', description: '管理 GitHub 仓库、Issue 和 PR' },
  { name: 'Weather', url: 'https://raw.githubusercontent.com/HKUDS/nanobot/main/nanobot/skills/weather/skill.md', description: '获取天气预报' },
]

const MCP_TEMPLATES = [
  { name: 'filesystem', type: 'stdio' as const, command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/home'], description: '本地文件系统访问' },
  { name: 'brave-search', type: 'stdio' as const, command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'], description: 'Brave 网页搜索' },
]

// ── 工具函数 ─────────────────────────────────────────────────────────────────

function useSaveState(): [SaveState, () => void] {
  const [state, setState] = useState<SaveState>('idle')
  const trigger = useCallback(() => {
    setState('saving')
    setTimeout(() => setState('saved'), 500)
    setTimeout(() => setState('idle'), 2000)
  }, [])
  return [state, trigger]
}

function parseJsonSafe(s: string): Record<string, string> {
  if (!s.trim()) return {}
  try { return JSON.parse(s) } catch { return {} }
}
function parseArgsSafe(s: string): string[] {
  if (!s.trim()) return []
  try { return JSON.parse(s) } catch { return s.split(',').map(x => x.trim()).filter(Boolean) }
}

// ── 模型配置标签页 ────────────────────────────────────────────────────────────

function ModelTab() {
  const [currentModel, setCurrentModel] = useState('')
  const [currentProvider, setCurrentProvider] = useState('')
  const [providers, setProviders] = useState<ProviderRow[]>([])
  const [newProviderName, setNewProviderName] = useState('')
  const [loading, setLoading] = useState(true)
  const [modelSave, triggerModelSave] = useSaveState()
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    if (loadedRef.current) return
    loadedRef.current = true
    setLoading(true)
    try {
      const cfg = await getConfig()
      const raw = cfg.config as Record<string, unknown>
      const agents = raw?.agents as Record<string, unknown> | undefined
      const defaults = agents?.defaults as Record<string, unknown> | undefined
      setCurrentModel((defaults?.model as string) ?? '')
      setCurrentProvider((defaults?.provider as string) ?? '')

      const rawProviders = raw?.providers as Record<string, { apiKey?: string; apiBase?: string; models?: ModelItem[] }> | undefined
      if (rawProviders) {
        setProviders(Object.entries(rawProviders).map(([name, v]) => ({
          name,
          apiKey: v?.apiKey ?? '',
          apiBase: v?.apiBase ?? '',
          models: v?.models ?? PRESET_MODELS[name] ?? [],
          showKey: false,
          newModelLabel: '',
          newModelValue: '',
        })))
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // 保存当前选中的模型
  const saveCurrentModel = async () => {
    await updateModel(currentModel, currentProvider || undefined)
    triggerModelSave()
  }

  // 保存服务商配置（包括模型列表）
  const saveProvider = async (row: ProviderRow) => {
    await updateProvider(row.name, {
      apiKey: row.apiKey !== MASKED ? row.apiKey : undefined,
      apiBase: row.apiBase,
      models: row.models,
    })
  }

  const removeProvider = async (name: string) => {
    if (!confirm(`确认删除服务商 "${name}"？`)) return
    await deleteProvider(name)
    setProviders(p => p.filter(r => r.name !== name))
    // 如果当前选中的是这个服务商，清空选择
    if (currentProvider === name) {
      setCurrentProvider('')
      setCurrentModel('')
    }
  }

  const addProvider = () => {
    const name = newProviderName.trim()
    if (!name || providers.find(p => p.name === name)) return
    setProviders(p => [...p, {
      name,
      apiKey: '',
      apiBase: '',
      models: PRESET_MODELS[name] ?? [],
      showKey: false,
      newModelLabel: '',
      newModelValue: '',
    }])
    setNewProviderName('')
  }

  const updateRow = (idx: number, patch: Partial<ProviderRow>) =>
    setProviders(p => p.map((r, i) => i === idx ? { ...r, ...patch } : r))

  // 获取所有已配置的模型（用于当前模型选择）
  const allConfiguredModels = providers.flatMap(p =>
    (p.models || []).map(m => ({ ...m, provider: p.name, providerLabel: PROVIDER_LABELS[p.name] || p.name }))
  )

  if (loading) return <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-brand-400" /></div>

  return (
    <div className="space-y-8">
      {/* ── 当前使用的模型 ── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-nb-text-muted mb-4">当前使用的模型</h3>
        {allConfiguredModels.length === 0 ? (
          <div className="text-sm text-nb-text-muted py-2">
            请先在下方配置服务商和模型
          </div>
        ) : (
          <div className="grid gap-4">
            <select
              value={currentProvider ? `${currentProvider}|${currentModel}` : ''}
              onChange={e => {
                const [provider, model] = e.target.value.split('|')
                setCurrentProvider(provider)
                setCurrentModel(model)
              }}
              className="w-full bg-nb-card border border-nb-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 appearance-none"
            >
              <option value="">请选择模型…</option>
              {providers.filter(p => p.models?.length > 0).map(p => (
                <optgroup key={p.name} label={PROVIDER_LABELS[p.name] || p.name}>
                  {p.models.map(m => (
                    <option key={`${p.name}|${m.value}`} value={`${p.name}|${m.value}`}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {currentModel && (
              <p className="text-xs text-nb-text-muted font-mono bg-nb-card/50 rounded-lg px-3 py-1.5">
                {PROVIDER_LABELS[currentProvider] || currentProvider} / {currentModel}
              </p>
            )}

            <button onClick={saveCurrentModel}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors w-fit">
              {modelSave === 'saving' ? <Loader2 size={15} className="animate-spin" /> :
               modelSave === 'saved' ? <CheckCircle size={15} className="text-green-300" /> :
               <Save size={15} />}
              {modelSave === 'saved' ? '已保存！' : '保存当前模型'}
            </button>
          </div>
        )}
      </section>

      {/* ── API 服务商配置 ── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-nb-text-muted mb-4">API 服务商配置</h3>
        <p className="text-xs text-nb-text-dim mb-4">配置服务商的 API Key 和可用模型列表。每个服务商可以添加多个模型。</p>
        <div className="space-y-4">
          {providers.map((row, idx) => (
            <ProviderCard
              key={row.name}
              row={row}
              onChange={patch => updateRow(idx, patch)}
              onSave={() => saveProvider(row)}
              onDelete={() => removeProvider(row.name)}
            />
          ))}

          {/* 添加新服务商 */}
          <div className="flex gap-2 pt-2">
            <select value={newProviderName} onChange={e => setNewProviderName(e.target.value)}
              className="flex-1 bg-nb-card border border-nb-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500">
              <option value="">选择要添加的服务商…</option>
              {KNOWN_PROVIDERS.filter(p => !providers.find(r => r.name === p)).map(p => (
                <option key={p} value={p}>{PROVIDER_LABELS[p] || p}</option>
              ))}
            </select>
            <input value={newProviderName} onChange={e => setNewProviderName(e.target.value)}
              placeholder="自定义名称"
              className="w-28 bg-nb-card border border-nb-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
            <button onClick={addProvider} disabled={!newProviderName.trim()}
              className="px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-40 disabled:hover:bg-brand-600 transition-colors text-sm">
              添加
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function ProviderCard({ row, onChange, onSave, onDelete }: {
  row: ProviderRow
  onChange: (p: Partial<ProviderRow>) => void
  onSave: () => void
  onDelete: () => void
}) {
  const [saveState, triggerSave] = useSaveState()

  const handleSave = async () => { await onSave(); triggerSave() }

  // 自动保存模型列表
  const saveModels = async (models: ModelItem[]) => {
    await updateProvider(row.name, {
      apiKey: row.apiKey !== MASKED ? row.apiKey : undefined,
      apiBase: row.apiBase,
      models,
    })
    triggerSave()
  }

  // 添加模型并自动保存
  const addModel = async () => {
    const label = row.newModelLabel.trim()
    const value = row.newModelValue.trim()
    if (!label || !value) return
    if (row.models.find(m => m.value === value)) return
    const newModels = [...row.models, { label, value }]
    onChange({
      models: newModels,
      newModelLabel: '',
      newModelValue: '',
    })
    await saveModels(newModels)
  }

  // 删除模型并自动保存
  const removeModel = async (value: string) => {
    const newModels = row.models.filter(m => m.value !== value)
    onChange({ models: newModels })
    await saveModels(newModels)
  }

  // 从预设添加模型并自动保存
  const addFromPresets = async (model: { label: string; value: string }) => {
    if (row.models.find(m => m.value === model.value)) return
    const newModels = [...row.models, model]
    onChange({ models: newModels })
    await saveModels(newModels)
  }

  const presets = PRESET_MODELS[row.name] || []
  const suggestedModels = presets.filter(p => !row.models.find(m => m.value === p.value))

  return (
    <div className="bg-nb-card border border-nb-border rounded-2xl p-4 space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-brand-400">{PROVIDER_LABELS[row.name] || row.name}</span>
        <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-nb-raised text-nb-text-muted hover:text-red-600 dark:hover:text-red-400 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>

      {/* API Key */}
      <div>
        <label className="block text-xs text-nb-text-dim mb-1">API Key</label>
        <div className="relative">
          <input type={row.showKey ? 'text' : 'password'} value={row.apiKey}
            onChange={e => onChange({ apiKey: e.target.value })}
            placeholder="sk-… 或 Bearer token"
            className="w-full bg-nb-raised border border-nb-border rounded-xl px-3 py-2 text-sm pr-9 outline-none focus:border-brand-500 transition-colors" />
          <button onClick={() => onChange({ showKey: !row.showKey })}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-nb-text-dim hover:text-nb-text-soft">
            {row.showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      {/* API Base URL */}
      <div>
        <label className="block text-xs text-nb-text-dim mb-1">
          API Base URL <span className="text-nb-text-muted">（可选）</span>
        </label>
        <input value={row.apiBase} onChange={e => onChange({ apiBase: e.target.value })}
          placeholder="https://api.provider.com/v1"
          className="w-full bg-nb-raised border border-nb-border rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-500 transition-colors" />
      </div>

      {/* 模型列表 */}
      <div>
        <label className="block text-xs text-nb-text-dim mb-2">可用模型</label>

        {/* 已配置的模型 */}
        {row.models.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {row.models.map(m => (
              <div key={m.value} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-nb-raised border border-nb-border text-xs">
                <span className="text-nb-text-soft">{m.label}</span>
                <button onClick={() => removeModel(m.value)} className="text-nb-text-muted hover:text-red-400">
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 添加自定义模型 */}
        <div className="flex gap-2 mb-2">
          <input value={row.newModelLabel} onChange={e => onChange({ newModelLabel: e.target.value })}
            placeholder="显示名"
            className="flex-1 bg-nb-raised border border-nb-border rounded-lg px-2 py-1.5 text-xs outline-none focus:border-brand-500" />
          <input value={row.newModelValue} onChange={e => onChange({ newModelValue: e.target.value })}
            placeholder="模型ID"
            className="flex-1 bg-nb-raised border border-nb-border rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:border-brand-500" />
          <button onClick={addModel} disabled={!row.newModelLabel.trim() || !row.newModelValue.trim()}
            className="px-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-40 transition-colors">
            <Plus size={14} />
          </button>
        </div>

        {/* 推荐模型 */}
        {suggestedModels.length > 0 && (
          <div>
            <p className="text-[10px] text-nb-text-muted mb-1">推荐模型（点击添加）：</p>
            <div className="flex flex-wrap gap-1">
              {suggestedModels.map(m => (
                <button key={m.value} onClick={() => addFromPresets(m)}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-nb-border hover:border-brand-500 hover:text-brand-400 text-nb-text-dim transition-colors">
                  + {m.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 保存按钮（仅保存 API Key 和 Base URL） */}
      <button onClick={handleSave}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-nb-card border border-nb-border hover:bg-nb-raised text-nb-text-soft transition-colors">
        {saveState === 'saving' ? <Loader2 size={12} className="animate-spin" /> :
         saveState === 'saved' ? <CheckCircle size={12} className="text-green-600 dark:text-green-400" /> :
         <Save size={12} />}
        {saveState === 'saved' ? '已保存' : '保存 API 配置'}
      </button>
    </div>
  )
}

// 服务商显示名称（提取为常量，供其他组件使用）
const PROVIDER_LABELS: Record<string, string> = {
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  gemini: 'Google Gemini',
  groq: 'Groq',
  minimax: 'MiniMax',
  moonshot: 'Moonshot',
  zhipu: '智谱 AI',
  dashscope: '通义千问',
  volcengine: '火山引擎',
  siliconflow: 'SiliconFlow',
  aihubmix: 'AIHubMix',
  azure_openai: 'Azure OpenAI',
  vllm: 'vLLM',
  custom: '自定义',
}

// ── 技能标签页 ────────────────────────────────────────────────────────────────

function SkillsTab() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [installUrl, setInstallUrl] = useState('')
  const [installName, setInstallName] = useState('')
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState('')
  const loadedRef = useRef(false)

  const reload = useCallback(async () => {
    if (loadedRef.current) return
    loadedRef.current = true
    setLoading(true)
    try { const d = await listSkills(); setSkills(d.skills) } finally { setLoading(false) }
  }, [])

  useEffect(() => { reload() }, [reload])

  const handleInstall = async (url?: string, name?: string) => {
    const targetUrl = url ?? installUrl.trim()
    if (!targetUrl) return
    setInstalling(true); setError('')
    try {
      const skillName = name ?? (installName.trim() || undefined)
      await installSkill(targetUrl, skillName)
      setInstallUrl(''); setInstallName('')
      await reload()
    } catch (err) { setError(String(err)) } finally { setInstalling(false) }
  }

  return (
    <div className="space-y-8">
      {/* 已安装 */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-nb-text-muted mb-4 flex items-center gap-2">
          已安装的技能 {loading && <Loader2 size={12} className="animate-spin" />}
        </h3>
        {skills.length === 0 && !loading
          ? <div className="flex items-center gap-2 text-sm text-nb-text-muted py-2"><BookOpen size={14} />暂未安装任何技能</div>
          : <div className="space-y-2">
              {skills.map(s => (
                <div key={s.id} className="flex items-start justify-between gap-3 bg-nb-card border border-nb-border rounded-2xl px-4 py-3">
                  <div className="flex gap-2.5 min-w-0">
                    <Puzzle size={15} className="text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{s.name}</p>
                      {s.description && <p className="text-xs text-nb-text-muted mt-0.5 line-clamp-1">{s.description}</p>}
                      <p className="text-xs text-nb-text-muted font-mono">{s.id}</p>
                    </div>
                  </div>
                  <button onClick={async () => { await deleteSkill(s.id); setSkills(p => p.filter(x => x.id !== s.id)) }}
                    className="p-1.5 rounded-lg hover:bg-nb-raised text-nb-text-muted hover:text-red-600 dark:hover:text-red-400 transition-colors shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
        }
      </section>

      {/* 从 URL 安装 */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-nb-text-muted mb-4">从链接安装技能</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-nb-text-dim mb-1">技能链接（skill.md）</label>
            <input value={installUrl} onChange={e => setInstallUrl(e.target.value)}
              placeholder="https://…/skill.md"
              className="w-full bg-nb-card border border-nb-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-nb-text-dim mb-1">目录名 <span className="text-nb-text-muted">（可选）</span></label>
            <input value={installName} onChange={e => setInstallName(e.target.value)}
              placeholder="my-skill"
              className="w-full bg-nb-card border border-nb-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
          </div>
          {error && (
            <div className="flex items-start gap-2 text-xs bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 rounded-xl px-3 py-2">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />{error}
            </div>
          )}
          <button onClick={() => handleInstall()} disabled={!installUrl.trim() || installing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-sm font-medium transition-colors">
            {installing ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            安装技能
          </button>
        </div>
      </section>

      {/* 精选技能 */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-nb-text-muted mb-4">精选技能</h3>
        <div className="space-y-2">
          {FEATURED_SKILLS.map(s => {
            const installed = skills.some(sk => sk.name.toLowerCase() === s.name.toLowerCase())
            return (
              <div key={s.name} className="flex items-center justify-between gap-3 bg-nb-card border border-nb-border rounded-2xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-nb-text-muted">{s.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a href={s.url} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 rounded-lg hover:bg-nb-raised text-nb-text-muted hover:text-nb-text-soft transition-colors">
                    <ExternalLink size={13} />
                  </a>
                  {installed
                    ? <span className="text-xs text-green-600 dark:text-green-400 font-medium">已安装</span>
                    : <button onClick={() => handleInstall(s.url, s.name.toLowerCase())} disabled={installing}
                        className="text-xs px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white transition-colors font-medium">
                        安装
                      </button>
                  }
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

// ── MCP 标签页 ────────────────────────────────────────────────────────────────

interface MCPFormState {
  name: string; type: 'stdio' | 'http'; command: string; args: string
  env: string; url: string; headers: string; toolTimeout: string
}
const emptyForm = (): MCPFormState => ({ name: '', type: 'stdio', command: '', args: '', env: '', url: '', headers: '', toolTimeout: '30' })

function MCPTab() {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [form, setForm] = useState<MCPFormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const loadedRef = useRef(false)

  const reload = useCallback(async () => {
    if (loadedRef.current) return
    loadedRef.current = true
    setLoading(true)
    try { const d = await listMCPServers(); setServers(d.servers as MCPServer[]) } finally { setLoading(false) }
  }, [])
  useEffect(() => { reload() }, [reload])

  const openAdd = () => { setForm(emptyForm()); setEditingName(null); setError(''); setShowForm(true) }
  const openEdit = (s: MCPServer) => {
    setForm({ name: s.name, type: s.type as 'stdio' | 'http', command: s.command ?? '', args: s.args ? JSON.stringify(s.args) : '', env: '', url: s.url ?? '', headers: s.headers ? JSON.stringify(s.headers, null, 2) : '', toolTimeout: String(s.toolTimeout ?? 30) })
    setEditingName(s.name); setError(''); setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('名称不能为空'); return }
    if (form.type === 'stdio' && !form.command.trim()) { setError('命令不能为空'); return }
    if (form.type === 'http' && !form.url.trim()) { setError('URL 不能为空'); return }
    setSaving(true); setError('')
    try {
      const payload: Record<string, unknown> = { name: form.name.trim(), type: form.type, toolTimeout: parseInt(form.toolTimeout) || 30 }
      if (form.type === 'stdio') { payload.command = form.command.trim(); payload.args = parseArgsSafe(form.args); payload.env = parseJsonSafe(form.env) }
      else { payload.url = form.url.trim(); payload.headers = parseJsonSafe(form.headers) }
      editingName ? await updateMCPServer(editingName, payload) : await addMCPServer(payload)
      setShowForm(false); await reload()
    } catch (err) { setError(String(err)) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-nb-text-muted flex items-center gap-2">
          MCP 服务器 {loading && <Loader2 size={12} className="animate-spin" />}
        </h3>
        <button onClick={openAdd} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white transition-colors font-medium">
          <Plus size={12} /> 添加服务器
        </button>
      </div>

      {servers.length === 0 && !loading && <p className="text-sm text-nb-text-muted py-2">暂未配置 MCP 服务器</p>}
      <div className="space-y-2">
        {servers.map(s => (
          <div key={s.name} className="flex items-start justify-between gap-3 bg-nb-card border border-nb-border rounded-2xl px-4 py-3">
            <div className="flex gap-2.5 min-w-0">
              {s.type === 'stdio' ? <Terminal size={14} className="text-orange-400 mt-0.5 shrink-0" /> : <Globe size={14} className="text-blue-400 mt-0.5 shrink-0" />}
              <div className="min-w-0">
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-xs text-nb-text-muted font-mono truncate">{s.type === 'stdio' ? `${s.command} ${(s.args ?? []).join(' ')}` : s.url}</p>
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${s.type === 'stdio' ? 'bg-orange-900/50 text-orange-300' : 'bg-blue-900/50 text-blue-300'}`}>{s.type}</span>
              <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-nb-raised text-nb-text-muted hover:text-nb-text-soft transition-colors"><Edit2 size={13} /></button>
              <button onClick={async () => { if (!confirm(`确认删除 "${s.name}"？`)) return; await deleteMCPServer(s.name); setServers(p => p.filter(x => x.name !== s.name)) }}
                className="p-1.5 rounded-lg hover:bg-nb-raised text-nb-text-muted hover:text-red-600 dark:hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>

      {/* 表单 */}
      {showForm && (
        <div className="bg-nb-card border border-nb-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">{editingName ? `编辑 "${editingName}"` : '新建 MCP 服务器'}</h4>
            <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-nb-raised text-nb-text-dim"><X size={14} /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-nb-text-dim mb-1">名称</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="my-server"
                className="w-full bg-nb-raised border border-nb-border rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="block text-xs text-nb-text-dim mb-1">类型</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'stdio' | 'http' }))}
                className="w-full bg-nb-raised border border-nb-border rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-500">
                <option value="stdio">stdio（本地进程）</option>
                <option value="http">http（远程端点）</option>
              </select>
            </div>
          </div>
          {form.type === 'stdio' ? (<>
            <div>
              <label className="block text-xs text-nb-text-dim mb-1">命令</label>
              <input value={form.command} onChange={e => setForm(f => ({ ...f, command: e.target.value }))} placeholder="npx"
                className="w-full bg-nb-raised border border-nb-border rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="block text-xs text-nb-text-dim mb-1">参数（JSON 数组或逗号分隔）</label>
              <input value={form.args} onChange={e => setForm(f => ({ ...f, args: e.target.value }))} placeholder='["-y", "@mcp/server"]'
                className="w-full bg-nb-raised border border-nb-border rounded-xl px-3 py-2 text-sm font-mono outline-none focus:border-brand-500" />
            </div>
          </>) : (<>
            <div>
              <label className="block text-xs text-nb-text-dim mb-1">URL</label>
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://mcp.example.com/sse"
                className="w-full bg-nb-raised border border-nb-border rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="block text-xs text-nb-text-dim mb-1">请求头（JSON）</label>
              <input value={form.headers} onChange={e => setForm(f => ({ ...f, headers: e.target.value }))} placeholder='{"Authorization":"Bearer …"}'
                className="w-full bg-nb-raised border border-nb-border rounded-xl px-3 py-2 text-sm font-mono outline-none focus:border-brand-500" />
            </div>
          </>)}
          <div>
            <label className="block text-xs text-nb-text-dim mb-1">超时时间（秒）</label>
            <input type="number" value={form.toolTimeout} onChange={e => setForm(f => ({ ...f, toolTimeout: e.target.value }))}
              className="w-24 bg-nb-raised border border-nb-border rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-500" />
          </div>
          {error && <div className="flex items-start gap-2 text-xs bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 rounded-xl px-3 py-2"><AlertCircle size={13} className="shrink-0 mt-0.5" />{error}</div>}
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-sm font-medium transition-colors">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {editingName ? '更新' : '添加'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl bg-nb-card border border-nb-border hover:bg-nb-raised text-nb-text-soft text-sm transition-colors">取消</button>
          </div>
        </div>
      )}

      {/* 快速模板 */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-nb-text-muted mb-4">快速模板</h3>
        <div className="space-y-2">
          {MCP_TEMPLATES.map(tmpl => {
            const installed = servers.some(s => s.name === tmpl.name)
            return (
              <div key={tmpl.name} className="flex items-center justify-between gap-3 bg-nb-card border border-nb-border rounded-2xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{tmpl.name}</p>
                  <p className="text-xs text-nb-text-muted">{tmpl.description}</p>
                  <p className="text-xs text-nb-text-muted font-mono">{tmpl.command} {tmpl.args.join(' ')}</p>
                </div>
                {installed
                  ? <span className="text-xs text-green-600 dark:text-green-400 font-medium shrink-0">已添加</span>
                  : <button
                      onClick={async () => { setSaving(true); try { await addMCPServer({ name: tmpl.name, type: tmpl.type, command: tmpl.command, args: tmpl.args, toolTimeout: 30 }); await reload() } finally { setSaving(false) } }}
                      disabled={saving}
                      className="text-xs px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white transition-colors font-medium shrink-0">
                      添加
                    </button>
                }
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

// ── Memory Tab ────────────────────────────────────────────────────────────────

function MemoryTab() {
  const [items, setItems] = useState<{ id: string; content: string; createdAt: number }[]>([])
  const [newText, setNewText] = useState('')
  const [loading, setLoading] = useState(true)
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    if (loadedRef.current) return
    loadedRef.current = true
    setLoading(true)
    try { setItems(await listMemory()) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!newText.trim()) return
    const entry = await addMemory(newText.trim())
    setItems(prev => [...prev, entry])
    setNewText('')
  }

  const handleDelete = async (id: string) => {
    await deleteMemory(id)
    setItems(prev => prev.filter(m => m.id !== id))
  }

  const handleClear = async () => {
    if (!confirm('确认清空所有记忆？')) return
    await clearMemory()
    setItems([])
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 p-3.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/30 rounded-xl text-xs text-blue-700 dark:text-blue-300">
        <Brain size={14} className="shrink-0 mt-0.5" />
        <span>AI 记忆会附加到每次对话的系统提示中，让智能体记住你的偏好和重要信息。</span>
      </div>

      {/* Add new memory */}
      <div className="flex gap-2">
        <input
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          placeholder="输入要记住的事项，例如：我喜欢简洁的回答"
          className="flex-1 bg-nb-card border border-nb-border rounded-lg px-3 py-2 text-sm text-nb-text-soft placeholder:text-nb-text-muted outline-none focus:border-brand-500"
        />
        <button
          onClick={handleAdd}
          disabled={!newText.trim()}
          className="shrink-0 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-sm text-white transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-nb-text-muted" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-nb-text-muted">
          <Brain size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">暂无记忆事项</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(m => (
            <div key={m.id} className="flex items-start gap-2 p-3 bg-nb-card rounded-lg group">
              <p className="flex-1 text-sm text-nb-text-soft leading-relaxed">{m.content}</p>
              <button
                onClick={() => handleDelete(m.id)}
                className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-nb-raised text-nb-text-dim hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button onClick={handleClear} className="w-full text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 py-1.5 transition-colors">
            清空所有记忆
          </button>
        </div>
      )}
    </div>
  )
}

// ── Categories Tab ────────────────────────────────────────────────────────────

function CategoriesTab() {
  const { t, i18n } = useTranslation()
  const [categories, setCategories] = useState<CategoryInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('📌')

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    setLoading(true)
    try {
      const data = await listCategories()
      setCategories(data)
    } catch (e) {
      console.error('Failed to load categories:', e)
    }
    setLoading(false)
  }

  const handleAdd = async () => {
    if (!newName.trim()) return
    try {
      const newCat = await addCategory(newName.trim(), newIcon)
      setCategories(prev => [...prev, newCat])
      setNewName('')
      setNewIcon('📌')
    } catch (e) {
      console.error('Failed to add category:', e)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('settings.deleteCategoryConfirm'))) return
    try {
      await deleteCategory(id)
      setCategories(prev => prev.filter(c => c.id !== id))
    } catch (e) {
      console.error('Failed to delete category:', e)
    }
  }

  // Separate preset and custom categories
  const presetCount = 10 // DEFAULT_CATEGORIES count
  const presetCategories = categories.slice(0, presetCount)
  const customCategories = categories.slice(presetCount)

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 p-3.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/30 rounded-xl text-xs text-blue-700 dark:text-blue-300">
        <Bookmark size={14} className="shrink-0 mt-0.5" />
        <span>{t('settings.categoriesDesc')}</span>
      </div>

      {/* Add new category */}
      <div className="flex gap-2">
        <input
          value={newIcon}
          onChange={e => setNewIcon(e.target.value)}
          placeholder="图标"
          className="w-16 bg-nb-card border border-nb-border rounded-lg px-3 py-2 text-sm text-nb-text-soft text-center outline-none focus:border-brand-500"
        />
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          placeholder={t('settings.categoryNamePlaceholder')}
          className="flex-1 bg-nb-card border border-nb-border rounded-lg px-3 py-2 text-sm text-nb-text-soft placeholder:text-nb-text-muted outline-none focus:border-brand-500"
        />
        <button
          onClick={handleAdd}
          disabled={!newName.trim()}
          className="shrink-0 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-sm text-white transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-nb-text-muted" /></div>
      ) : (
        <>
          {/* Preset categories (read-only) */}
          <div>
            <h3 className="text-xs font-semibold text-nb-text-muted uppercase tracking-wider mb-3">{t('settings.presetCategories')}</h3>
            <div className="grid grid-cols-2 gap-2">
              {presetCategories.map(cat => (
                <div key={cat.id} className="flex items-center gap-2 p-2.5 bg-nb-card rounded-lg">
                  <span className="text-lg">{cat.icon}</span>
                  <span className="text-sm text-nb-text-soft">{i18n.language === 'zh-CN' ? cat.name : (cat.name_en || cat.name)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Custom categories */}
          {customCategories.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-nb-text-muted uppercase tracking-wider mb-3">{t('settings.customCategories')}</h3>
              <div className="space-y-2">
                {customCategories.map(cat => (
                  <div key={cat.id} className="flex items-center gap-2 p-3 bg-nb-card rounded-lg group">
                    <span className="text-lg">{cat.icon}</span>
                    <span className="flex-1 text-sm text-nb-text-soft">{i18n.language === 'zh-CN' ? cat.name : (cat.name_en || cat.name)}</span>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-nb-raised text-nb-text-dim hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {customCategories.length === 0 && (
            <div className="text-center py-6 text-nb-text-muted">
              <Bookmark size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('settings.noCustomCategories')}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── 弹窗主体 ──────────────────────────────────────────────────────────────────

interface SettingsModalProps {
  open: boolean
  onClose: () => void
}

// ── Appearance Tab ────────────────────────────────────────────────────────────

function ToggleRow({ icon, title, desc, checked, onChange }: {
  icon: React.ReactNode
  title: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start gap-4 py-4 border-b border-nb-border-soft last:border-0">
      <div className="w-9 h-9 rounded-xl bg-nb-card flex items-center justify-center shrink-0 text-brand-400">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-nb-text">{title}</p>
        <p className="text-xs text-nb-text-muted mt-0.5 leading-relaxed">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 mt-1 cursor-pointer rounded-full border-2 border-transparent
          transition-colors duration-200 ease-in-out focus:outline-none
          ${checked ? 'bg-brand-500' : 'bg-nb-raised'}`}
        role="switch" aria-checked={checked}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg
          transform transition-transform duration-200 ease-in-out
          ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
  )
}

function AppearanceTab() {
  const { t, i18n } = useTranslation()
  const eAPI = (window as any).electronAPI
  const [fxOn,  setFxOn]  = useState(true)
  const [adOn,  setAdOn]  = useState(true)
  const { theme, setTheme, isDark } = useTheme()

  useEffect(() => {
    eAPI?.getFXEnabled().then(setFxOn).catch(() => {})
    eAPI?.getAdBlockEnabled().then(setAdOn).catch(() => {})
  }, [])

  const handleFX = (v: boolean) => {
    setFxOn(v)
    eAPI?.setFXEnabled(v)
  }
  const handleAd = (v: boolean) => {
    setAdOn(v)
    eAPI?.setAdBlockEnabled(v)
  }

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold text-nb-text-muted uppercase tracking-wider mb-4">外观与行为</h3>

      {/* Language */}
      <div className="flex items-start gap-4 py-4 border-b border-nb-border-soft">
        <div className="w-9 h-9 rounded-xl bg-nb-card flex items-center justify-center shrink-0 text-brand-400">
          <Globe size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-nb-text">语言 / Language</p>
          <p className="text-xs text-nb-text-muted mt-0.5 leading-relaxed">Switch interface language.</p>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 bg-nb-raised rounded-xl p-1 shrink-0">
          <button
            onClick={() => i18n.changeLanguage('zh-CN')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              i18n.language.startsWith('zh')
                ? 'bg-nb-card text-nb-text shadow-sm'
                : 'text-nb-text-dim hover:text-nb-text'
            }`}
          >
            中文
          </button>
          <button
            onClick={() => i18n.changeLanguage('en')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              i18n.language.startsWith('en')
                ? 'bg-nb-card text-nb-text shadow-sm'
                : 'text-nb-text-dim hover:text-nb-text'
            }`}
          >
            English
          </button>
        </div>
      </div>

      {/* Theme mode */}
      <div className="flex items-start gap-4 py-4 border-b border-nb-border-soft">
        <div className="w-9 h-9 rounded-xl bg-nb-card flex items-center justify-center shrink-0 text-brand-400">
          {isDark ? <Moon size={18} /> : <Sun size={18} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-nb-text">{t('settings.theme')}</p>
          <p className="text-xs text-nb-text-muted mt-0.5 leading-relaxed">{t('settings.themeDesc')}</p>
        </div>
        <div className="flex items-center gap-1 mt-0.5 bg-nb-raised rounded-xl p-1 shrink-0">
          <button
            onClick={() => setTheme('light')}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
              theme === 'light'
                ? 'bg-nb-card text-nb-text shadow-sm'
                : 'text-nb-text-dim hover:text-nb-text'
            }`}
          >
            <Sun size={13} /> {t('settings.day')}
          </button>
          <button
            onClick={() => setTheme('system')}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
              theme === 'system'
                ? 'bg-nb-card text-nb-text shadow-sm'
                : 'text-nb-text-dim hover:text-nb-text'
            }`}
          >
            <Monitor size={13} /> {t('settings.system')}
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
              theme === 'dark'
                ? 'bg-nb-card text-nb-text shadow-sm'
                : 'text-nb-text-dim hover:text-nb-text'
            }`}
          >
            <Moon size={13} /> {t('settings.night')}
          </button>
        </div>
      </div>

      <ToggleRow
        icon={<MousePointer2 size={18} />}
        title={t('settings.fxTitle')}
        desc={t('settings.fxDesc')}
        checked={fxOn}
        onChange={handleFX}
      />

      <ToggleRow
        icon={<span className="text-base">🚫</span>}
        title={t('settings.adBlock')}
        desc={t('settings.adBlockDesc')}
        checked={adOn}
        onChange={handleAd}
      />

      {/* Preview */}
      <div className="mt-6 rounded-xl border border-nb-border bg-nb-card/40 p-5">
        <p className="text-xs font-semibold text-nb-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Sparkles size={12} /> 动效预览
        </p>
        <div className="flex items-center gap-3 text-sm text-nb-text-dim">
          <MousePointer2 size={20} className={fxOn ? 'text-brand-400' : 'text-nb-text-muted'} />
          <div>
            <span className={fxOn ? 'text-nb-text-soft' : 'text-nb-text-muted'}>
              {fxOn ? t('settings.fxOn') : t('settings.fxOff')}
            </span>
            <p className="text-xs text-nb-text-muted mt-0.5">
              {fxOn ? t('settings.fxHint') : t('settings.fxHintOff')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

const TABS: { id: Tab; labelKey: string; icon: React.ReactNode }[] = [
  { id: 'model',      labelKey: 'settings.model',      icon: <Settings size={15} /> },
  { id: 'skills',     labelKey: 'settings.skills',     icon: <Puzzle size={15} /> },
  { id: 'mcp',        labelKey: 'settings.mcp',        icon: <Server size={15} /> },
  { id: 'memory',     labelKey: 'settings.memory',     icon: <Brain size={15} /> },
  { id: 'categories', labelKey: 'settings.categories', icon: <Bookmark size={15} /> },
  { id: 'appearance', labelKey: 'settings.appearance', icon: <Sparkles size={15} /> },
]

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('model')
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onMouseDown={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col bg-nb-base rounded-2xl border border-nb-border shadow-2xl overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-nb-border shrink-0">
          <h2 className="text-base font-bold flex items-center gap-2.5">
            <Settings size={18} className="text-brand-400" />
            {t('settings.title')}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-nb-card text-nb-text-dim hover:text-nb-text-soft transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* 左侧导航 */}
          <div className="w-44 shrink-0 border-r border-nb-border bg-nb-base/50 p-3 space-y-1">
            {TABS.map(tabItem => (
              <button key={tabItem.id} onClick={() => setTab(tabItem.id)}
                className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                  tab === tabItem.id
                    ? 'bg-brand-600/15 text-brand-600 dark:text-brand-300 border border-brand-600/25'
                    : 'text-nb-text-dim hover:bg-nb-card hover:text-nb-text-soft'
                }`}>
                {tabItem.icon}
                {t(tabItem.labelKey)}
              </button>
            ))}
          </div>

          {/* 内容区域 */}
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
            {tab === 'model'      && <ModelTab />}
            {tab === 'skills'     && <SkillsTab />}
            {tab === 'mcp'        && <MCPTab />}
            {tab === 'memory'     && <MemoryTab />}
            {tab === 'categories' && <CategoriesTab />}
            {tab === 'appearance' && <AppearanceTab />}
          </div>
        </div>
      </div>
    </div>
  )
}
