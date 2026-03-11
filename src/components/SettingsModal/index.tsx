import { useCallback, useEffect, useRef, useState } from 'react'
import {
  X, Settings, Save, Plus, Trash2, Eye, EyeOff,
  Loader2, CheckCircle, Puzzle, Server, Terminal,
  Globe, Edit2, Check, AlertCircle, ExternalLink, BookOpen, Brain, Sparkles,
  MousePointer2, Sun, Moon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../hooks/useTheme'
import {
  getConfig, updateModel, updateProvider, deleteProvider,
  listSkills, installSkill, deleteSkill,
  listMCPServers, addMCPServer, updateMCPServer, deleteMCPServer,
  listMemory, addMemory, deleteMemory, clearMemory,
} from '../../api/client'

// ── 类型 ─────────────────────────────────────────────────────────────────────

type Tab = 'model' | 'skills' | 'mcp' | 'memory' | 'appearance'
type SaveState = 'idle' | 'saving' | 'saved'

interface ProviderRow { name: string; apiKey: string; apiBase: string; showKey: boolean }
interface Skill { id: string; name: string; description: string }
interface MCPServer {
  name: string; type: string; command?: string; args?: string[]
  url?: string; headers?: Record<string, string>; toolTimeout?: number
}

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
  const [model, setModel] = useState('')
  const [selectedProvider, setSelectedProvider] = useState('')
  const [providers, setProviders] = useState<ProviderRow[]>([])
  const [newProviderName, setNewProviderName] = useState('')
  const [loading, setLoading] = useState(true)
  const [modelSave, triggerModelSave] = useSaveState()
  // 是否使用自定义模型名（不从预设选择）
  const [customModelMode, setCustomModelMode] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const cfg = await getConfig()
      const raw = cfg.config as Record<string, unknown>
      const agents = raw?.agents as Record<string, unknown> | undefined
      const defaults = agents?.defaults as Record<string, unknown> | undefined
      const savedModel = (defaults?.model as string) ?? ''
      const savedProvider = (defaults?.provider as string) ?? ''
      setModel(savedModel)
      setSelectedProvider(savedProvider)
      const rawProviders = raw?.providers as Record<string, { apiKey?: string; apiBase?: string }> | undefined
      if (rawProviders) {
        setProviders(Object.entries(rawProviders).map(([name, v]) => ({
          name, apiKey: v?.apiKey ?? '', apiBase: v?.apiBase ?? '', showKey: false,
        })))
      }
      // 如果已保存的模型不在预设列表里，默认进入自定义模式
      const presets = PRESET_MODELS[savedProvider] ?? PRESET_MODELS[Object.keys(rawProviders ?? {})[0] ?? ''] ?? []
      if (savedModel && !presets.find(p => p.value === savedModel)) {
        setCustomModelMode(true)
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const saveModel = async () => {
    await updateModel(model, selectedProvider || undefined)
    triggerModelSave()
  }

  const saveProvider = async (row: ProviderRow) => {
    await updateProvider(row.name, {
      apiKey: row.apiKey !== MASKED ? row.apiKey : undefined,
      apiBase: row.apiBase,
    })
  }

  const removeProvider = async (name: string) => {
    if (!confirm(`确认删除服务商 "${name}"？`)) return
    await deleteProvider(name)
    setProviders(p => p.filter(r => r.name !== name))
  }

  const addProvider = () => {
    const name = newProviderName.trim()
    if (!name || providers.find(p => p.name === name)) return
    setProviders(p => [...p, { name, apiKey: '', apiBase: '', showKey: false }])
    setNewProviderName('')
  }

  const updateRow = (idx: number, patch: Partial<ProviderRow>) =>
    setProviders(p => p.map((r, i) => i === idx ? { ...r, ...patch } : r))

  if (loading) return <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-brand-400" /></div>

  // 当前服务商的预设模型列表
  const currentProvider = selectedProvider || providers[0]?.name || ''
  const presets = PRESET_MODELS[currentProvider] ?? []

  return (
    <div className="space-y-8">
      {/* ── 当前模型 ── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-nb-text-muted mb-4">当前使用的模型</h3>
        <div className="grid gap-4">
          {/* 服务商选择：已配置的 + 预置列表（去重合并） */}
          <div>
            <label className="block text-sm font-medium text-nb-text-soft mb-1.5">服务商</label>
            <select
              value={selectedProvider}
              onChange={e => { setSelectedProvider(e.target.value); setCustomModelMode(false); setModel('') }}
              className="w-full bg-nb-card border border-nb-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 appearance-none"
            >
              <option value="">自动检测（根据模型名）</option>
              {/* 已配置的服务商优先显示 */}
              {providers.length > 0 && (
                <optgroup label="已配置">
                  {providers.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </optgroup>
              )}
              {/* 预置服务商（过滤掉已配置的） */}
              <optgroup label="其他预置">
                {KNOWN_PROVIDERS
                  .filter(p => !providers.find(r => r.name === p))
                  .map(p => <option key={p} value={p}>{p}</option>)}
              </optgroup>
            </select>
          </div>

          {/* 模型选择 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-nb-text-soft">模型名称</label>
              <button
                onClick={() => setCustomModelMode(v => !v)}
                className="text-xs text-brand-500 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
              >
                {customModelMode ? '从预设选择' : '自定义输入'}
              </button>
            </div>

            {(customModelMode || presets.length === 0) ? (
              // 自定义输入框（无预设时自动退到此模式）
              <>
                <input
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder="输入完整模型名称，如 qwen-max"
                  className="w-full bg-nb-card border border-nb-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 transition-colors font-mono"
                />
                {presets.length === 0 && !customModelMode && (
                  <p className="text-xs text-nb-text-muted mt-1">该服务商暂无内置预设，请手动输入模型名称</p>
                )}
              </>
            ) : (
              // 预设下拉 + 快捷按钮
              <>
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="w-full bg-nb-card border border-nb-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 appearance-none"
                >
                  <option value="">请选择模型…</option>
                  {presets.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {presets.map(p => (
                    <button key={p.value} onClick={() => setModel(p.value)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                        model === p.value
                          ? 'bg-brand-600 border-brand-500 text-white'
                          : 'bg-nb-card border-nb-border text-nb-text-dim hover:border-nb-text-dim hover:text-nb-text-soft'
                      }`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* 当前值预览 */}
            {model && (
              <p className="text-xs text-nb-text-muted mt-1.5 font-mono bg-nb-card/50 rounded-lg px-3 py-1.5">
                当前：{model}
              </p>
            )}
          </div>

          <button onClick={saveModel}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-sm font-medium transition-colors w-fit">
            {modelSave === 'saving' ? <Loader2 size={15} className="animate-spin" /> :
             modelSave === 'saved' ? <CheckCircle size={15} className="text-green-300" /> :
             <Save size={15} />}
            {modelSave === 'saved' ? '已保存！' : '保存模型配置'}
          </button>
        </div>
      </section>

      {/* ── API 服务商配置 ── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-nb-text-muted mb-4">API 服务商</h3>
        <div className="space-y-3">
          {providers.map((row, idx) => (
            <ProviderCard key={row.name} row={row}
              onChange={patch => updateRow(idx, patch)}
              onSave={() => saveProvider(row)}
              onDelete={() => removeProvider(row.name)} />
          ))}

          {/* 添加新服务商 */}
          <div className="flex gap-2 pt-1">
            <select value={newProviderName} onChange={e => setNewProviderName(e.target.value)}
              className="flex-1 bg-nb-card border border-nb-border rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-500">
              <option value="">选择要添加的服务商…</option>
              {KNOWN_PROVIDERS.filter(p => !providers.find(r => r.name === p)).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input value={newProviderName} onChange={e => setNewProviderName(e.target.value)}
              placeholder="自定义名称"
              className="w-28 bg-nb-card border border-nb-border rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-500" />
            <button onClick={addProvider} disabled={!newProviderName.trim()}
              className="px-3 rounded-xl bg-nb-card border border-nb-border hover:bg-nb-raised text-nb-text-soft disabled:opacity-40 transition-colors" title="添加">
              <Plus size={16} />
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

  return (
    <div className="bg-nb-card border border-nb-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-mono font-semibold text-brand-400">{row.name}</span>
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
          API Base URL <span className="text-nb-text-muted">（可选，自定义端点）</span>
        </label>
        <input value={row.apiBase} onChange={e => onChange({ apiBase: e.target.value })}
          placeholder="https://api.provider.com/v1"
          className="w-full bg-nb-raised border border-nb-border rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-500 transition-colors" />
      </div>

      <button onClick={handleSave}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-nb-card border border-nb-border hover:bg-nb-raised text-nb-text-soft transition-colors">
        {saveState === 'saving' ? <Loader2 size={12} className="animate-spin" /> :
         saveState === 'saved' ? <CheckCircle size={12} className="text-green-600 dark:text-green-400" /> :
         <Save size={12} />}
        {saveState === 'saved' ? '已保存' : '保存'}
      </button>
    </div>
  )
}

// ── 技能标签页 ────────────────────────────────────────────────────────────────

function SkillsTab() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [installUrl, setInstallUrl] = useState('')
  const [installName, setInstallName] = useState('')
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
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

  const reload = useCallback(async () => {
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

  const load = useCallback(async () => {
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
  const { setTheme, isDark } = useTheme()

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
        <div className="flex items-center gap-1.5 mt-0.5 bg-nb-raised rounded-xl p-1 shrink-0">
          <button
            onClick={() => setTheme('light')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              !isDark
                ? 'bg-nb-card text-nb-text shadow-sm'
                : 'text-nb-text-dim hover:text-nb-text'
            }`}
          >
            <Sun size={13} /> {t('settings.day')}
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isDark
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
            {tab === 'appearance' && <AppearanceTab />}
          </div>
        </div>
      </div>
    </div>
  )
}
