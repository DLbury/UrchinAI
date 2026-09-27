import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  X, Settings, Save, Plus, Trash2, Eye, EyeOff,
  Loader2, CheckCircle, Puzzle, Server, Terminal,
  Globe, Edit2, Check, AlertCircle, ExternalLink, BookOpen, Brain, Sparkles,
  MousePointer2, Sun, Moon, Monitor, Bookmark, Cookie, Search, ShieldOff,
  RefreshCw,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useTheme } from '../../hooks/useTheme'
import i18n, { nativeLanguageName } from '../../i18n'
import LanguagePicker from '../LanguagePicker'
import ItemIcon, { DEFAULT_ICON_NAME, ICON_NAMES } from '../../lib/icons'
import { categoryDisplayName, categoryIconName } from '../../lib/categories'
import { formatDateTime } from '../../lib/format'
import {
  getConfig, updateModel, updateProvider, deleteProvider,
  listSkills, installSkill, installLocalSkill, deleteSkill,
  listAnthropicSkills,
  listMCPServers, addMCPServer, updateMCPServer, deleteMCPServer,
  listPromptMemory, addPromptMemory, deletePromptMemory, clearPromptMemory,
  listArchiveSessions, searchArchive, clearArchiveSession, clearAllArchive,
  listSkillMemory, getSkillMemory, saveSkillMemory, deleteSkillMemory,
  listCategories, addCategory, deleteCategory,
  getAgentLimits, updateAgentLimits, getSearchEngine, updateSearchEngine,
  getTranslationConfig, updateTranslationConfig,
  fetchProviderModels,
} from '../../api/client'

// ── 类型 ─────────────────────────────────────────────────────────────────────

type Tab = 'model' | 'skills' | 'mcp' | 'memory' | 'categories' | 'appearance' | 'cookies'
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
interface CategoryInfo { id: string; name: string; name_en?: string; name_fa?: string; icon: string }
interface CookieItem   { name: string; value: string; domain: string; path: string; secure: boolean; httpOnly: boolean; sameSite: string; expirationDate?: number }

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

const MCP_TEMPLATES = [
  { name: 'filesystem', type: 'stdio' as const, command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/home'] },
  { name: 'brave-search', type: 'stdio' as const, command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'] },
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

/** Translation targets, labelled in their own endonym so they stay identifiable. */
const TARGET_LANGUAGES = [
  '中文', 'English', '日本語', '한국어',
  'Français', 'Deutsch', 'Español', 'Русский',
  'فارسی', 'العربية', 'Português', 'Italiano',
]

function ModelTab() {
  const { t } = useTranslation()
  const [currentModel, setCurrentModel] = useState('')
  const [currentProvider, setCurrentProvider] = useState('')
  const [providers, setProviders] = useState<ProviderRow[]>([])
  const [newProviderName, setNewProviderName] = useState('')
  const [loading, setLoading] = useState(true)
  const [modelSave, triggerModelSave] = useSaveState()
  const loadedRef = useRef(false)

  // Translation settings
  const [transProvider, setTransProvider] = useState('')
  const [transModel, setTransModel] = useState('')
  const [targetLang, setTargetLang] = useState(() => nativeLanguageName(i18n.language))
  const [transSave, triggerTransSave] = useSaveState()

  const load = useCallback(async () => {
    if (loadedRef.current) return
    loadedRef.current = true
    setLoading(true)
    try {
      const cfg = await getConfig()
      const raw = cfg.config as Record<string, unknown>
      const agents = raw?.agents as Record<string, unknown> | undefined
      const defaults = agents?.defaults as Record<string, unknown> | undefined

      // Legacy provider name migration (same as backend/agent/manager.py)
      const LEGACY_PROVIDER_MAP: Record<string, string> = { ali: 'dashscope', zhipu: 'zhipuai' }
      const migrateProvider = (name: string) => LEGACY_PROVIDER_MAP[name] ?? name

      const rawProvider = (defaults?.provider as string) ?? ''
      const migratedProvider = migrateProvider(rawProvider)
      setCurrentModel((defaults?.model as string) ?? '')
      setCurrentProvider(migratedProvider)

      const rawProviders = raw?.providers as Record<string, { apiKey?: string; apiBase?: string; models?: ModelItem[] }> | undefined
      if (rawProviders) {
        setProviders(Object.entries(rawProviders).map(([name, v]) => {
          const migratedName = migrateProvider(name)
          return {
            name: migratedName,
            apiKey: v?.apiKey ?? '',
            apiBase: v?.apiBase ?? '',
            models: v?.models ?? PRESET_MODELS[migratedName] ?? [],
            showKey: false,
            newModelLabel: '',
            newModelValue: '',
          }
        }))
      }

      // Load translation config
      try {
        const tCfg = await getTranslationConfig()
        setTransProvider(tCfg.provider || '')
        setTransModel(tCfg.model || '')
        setTargetLang(tCfg.targetLang || nativeLanguageName(i18n.language))
      } catch {
        // fallback: use defaults
        setTransProvider(migratedProvider)
        setTransModel((defaults?.model as string) ?? '')
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // 保存当前选中的模型
  const saveCurrentModel = async () => {
    await updateModel(currentModel, currentProvider || undefined)
    triggerModelSave()
  }

  // 保存翻译配置
  const saveTranslationConfig = async () => {
    await updateTranslationConfig({
      model: transModel,
      provider: transProvider,
      targetLang,
    })
    triggerTransSave()
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
    if (!confirm(t('settings.modelSection.deleteProviderConfirm', { name }))) return
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
    (p.models || []).map(m => ({ ...m, provider: p.name, providerLabel: providerLabel(t, p.name) }))
  )

  if (loading) return <div className="flex items-center justify-center h-48"><Loader2 size={24} className="animate-spin text-brand-400" /></div>

  return (
    <div className="space-y-8">
      {/* ── 当前使用的模型 ── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-nb-text-muted mb-4">{t('settings.modelSection.currentModel')}</h3>
        {allConfiguredModels.length === 0 ? (
          <div className="text-sm text-nb-text-muted py-2">
            {t('settings.modelSection.configureFirst')}
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
              className="text-nb-text-soft w-full bg-nb-card border border-nb-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 appearance-none"
            >
              <option value="">{t('settings.modelSection.selectModel')}</option>
              {providers.filter(p => p.models?.length > 0).map(p => (
                <optgroup key={p.name} label={providerLabel(t, p.name)}>
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
                {providerLabel(t, currentProvider) || currentProvider} / {currentModel}
              </p>
            )}

            <button onClick={saveCurrentModel}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors w-fit">
              {modelSave === 'saving' ? <Loader2 size={15} className="animate-spin" /> :
               modelSave === 'saved' ? <CheckCircle size={15} className="text-green-300" /> :
               <Save size={15} />}
              {modelSave === 'saved' ? t('settings.modelSection.saved') : t('settings.modelSection.saveCurrentModel')}
            </button>
          </div>
        )}
      </section>

      {/* ── 翻译设置 ── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-nb-text-muted mb-4">{t('settings.modelSection.translation')}</h3>
        <p className="text-xs text-nb-text-dim mb-4">{t('settings.modelSection.translationDesc')}</p>
        <div className="grid gap-4">
          {/* 翻译模型 */}
          <div>
            <label className="block text-xs text-nb-text-dim mb-1.5">{t('settings.modelSection.translationModel')}</label>
            <select
              value={transProvider ? `${transProvider}|${transModel}` : ''}
              onChange={e => {
                const [provider, model] = e.target.value.split('|')
                setTransProvider(provider)
                setTransModel(model)
              }}
              className="text-nb-text-soft w-full bg-nb-card border border-nb-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 appearance-none"
            >
              <option value="">{t('settings.modelSection.defaultModel')}</option>
              {providers.filter(p => p.models?.length > 0).map(p => (
                <optgroup key={p.name} label={providerLabel(t, p.name)}>
                  {p.models.map(m => (
                    <option key={`${p.name}|${m.value}`} value={`${p.name}|${m.value}`}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {transModel && (
              <p className="text-xs text-nb-text-muted font-mono bg-nb-card/50 rounded-lg px-3 py-1.5 mt-2">
                {providerLabel(t, transProvider) || transProvider} / {transModel}
              </p>
            )}
          </div>

          {/* 目标语言 */}
          <div>
            <label className="block text-xs text-nb-text-dim mb-1.5">{t('settings.modelSection.targetLang')}</label>
            <select
              value={targetLang}
              onChange={e => setTargetLang(e.target.value)}
              className="text-nb-text-soft w-full bg-nb-card border border-nb-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand-500 appearance-none"
            >
              {!TARGET_LANGUAGES.includes(targetLang) && <option value={targetLang}>{targetLang}</option>}
              {TARGET_LANGUAGES.map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>

          <button onClick={saveTranslationConfig}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors w-fit">
            {transSave === 'saving' ? <Loader2 size={15} className="animate-spin" /> :
             transSave === 'saved' ? <CheckCircle size={15} className="text-green-300" /> :
             <Save size={15} />}
            {transSave === 'saved' ? t('settings.modelSection.savedTranslation') : t('settings.modelSection.saveTranslation')}
          </button>
        </div>
      </section>

      {/* ── API 服务商配置 ── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-nb-text-muted mb-4">{t('settings.modelSection.providers')}</h3>
        <p className="text-xs text-nb-text-dim mb-4">{t('settings.modelSection.providersDesc')}</p>
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
              className="text-nb-text-soft flex-1 bg-nb-card border border-nb-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500">
              <option value="">{t('settings.modelSection.selectProvider')}</option>
              {KNOWN_PROVIDERS.filter(p => !providers.find(r => r.name === p)).map(p => (
                <option key={p} value={p}>{providerLabel(t, p)}</option>
              ))}
            </select>
            <input value={newProviderName} onChange={e => setNewProviderName(e.target.value)}
              placeholder={t('settings.modelSection.customName')}
              className="text-nb-text-soft w-28 bg-nb-card border border-nb-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
            <button onClick={addProvider} disabled={!newProviderName.trim()}
              className="px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-40 disabled:hover:bg-brand-600 transition-colors text-sm">
              {t('settings.modelSection.add')}
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
  const { t } = useTranslation()
  const [saveState, triggerSave] = useSaveState()
  const [fetching, setFetching] = useState(false)
  const [fetchNote, setFetchNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [showAll, setShowAll] = useState(false)

  // Providers that have to be pointed at a self-hosted endpoint by hand.
  const needsBaseUrl = row.name === 'custom' || row.name === 'vllm'

  const saveModels = async (models: ModelItem[]) => {
    await updateProvider(row.name, {
      apiKey: row.apiKey !== MASKED ? row.apiKey : undefined,
      apiBase: needsBaseUrl ? row.apiBase : undefined,
      models,
    })
    triggerSave()
  }

  // Ask the provider for its catalogue and add everything it returns.
  const syncModels = async () => {
    if (!row.apiKey || row.apiKey === MASKED) return
    setFetching(true)
    setFetchNote(null)
    try {
      const { models } = await fetchProviderModels(row.name, row.apiKey)
      const merged = [...row.models]
      let added = 0
      for (const m of models) {
        if (merged.some(x => x.value === m.value)) continue
        merged.push({ label: m.label, value: m.value })
        added++
      }
      onChange({ models: merged })
      await saveModels(merged)
      setFetchNote({
        ok: true,
        text: t('settings.modelSection.modelsFetched', {
          count: models.length,
          free: models.filter(m => m.isFree).length,
          added,
        }),
      })
    } catch (err) {
      setFetchNote({ ok: false, text: (err as Error).message })
    } finally {
      setFetching(false)
    }
  }

  // Saving the key is what triggers discovery, so one click does both.
  const handleSave = async () => {
    await onSave()
    await syncModels()
    triggerSave()
  }

  // Adding the key and pressing Enter should do the same thing.
  const handleKeyEnter = () => { void handleSave() }

  const addModel = async () => {
    const label = row.newModelLabel.trim()
    const value = row.newModelValue.trim()
    if (!label || !value) return
    if (row.models.find(m => m.value === value)) return
    const newModels = [...row.models, { label, value }]
    onChange({ models: newModels, newModelLabel: '', newModelValue: '' })
    await saveModels(newModels)
  }

  const removeModel = async (value: string) => {
    const newModels = row.models.filter(m => m.value !== value)
    onChange({ models: newModels })
    await saveModels(newModels)
  }

  const addFromPresets = async (model: { label: string; value: string }) => {
    if (row.models.find(m => m.value === model.value)) return
    const newModels = [...row.models, model]
    onChange({ models: newModels })
    await saveModels(newModels)
  }

  const presets = PRESET_MODELS[row.name] || []
  const suggestedModels = presets.filter(p => !row.models.find(m => m.value === p.value))
  const visibleModels = showAll ? row.models : row.models.slice(0, 24)

  return (
    <div className="bg-nb-card border border-nb-border rounded-2xl p-4 space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-brand-400">{providerLabel(t, row.name)}</span>
        <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-nb-raised text-nb-text-muted hover:text-red-600 dark:hover:text-red-400 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>

      {/* API Key — 唯一的输入项；保存后自动拉取该服务商的全部模型 */}
      <div>
        <label className="block text-xs text-nb-text-dim mb-1">{t('settings.modelSection.apiKey')}</label>
        <div className="relative">
          <input type={row.showKey ? 'text' : 'password'} value={row.apiKey}
            onChange={e => { onChange({ apiKey: e.target.value }); setFetchNote(null) }}
            onKeyDown={e => { if (e.key === 'Enter') handleKeyEnter() }}
            placeholder={t('settings.modelSection.apiKeyPlaceholder')}
            className="text-nb-text-soft w-full bg-nb-raised border border-nb-border rounded-xl px-3 py-2 text-sm pr-9 outline-none focus:border-brand-500 transition-colors" />
          <button onClick={() => onChange({ showKey: !row.showKey })}
            title={row.showKey ? t('settings.modelSection.hideKey') : t('settings.modelSection.showKey')}
            aria-label={row.showKey ? t('settings.modelSection.hideKey') : t('settings.modelSection.showKey')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-nb-text-dim hover:text-nb-text-soft">
            {row.showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <p className="mt-1 text-[10px] text-nb-text-muted leading-relaxed">
          {t('settings.modelSection.apiKeyHint')}
        </p>
      </div>

      {/* API Base URL：仅自建服务需要填写 */}
      {needsBaseUrl && (
        <div>
          <label className="block text-xs text-nb-text-dim mb-1">
            {t('settings.modelSection.apiBase')} <span className="text-nb-text-muted">({t('common.optional')})</span>
          </label>
          <input value={row.apiBase} onChange={e => onChange({ apiBase: e.target.value })}
            placeholder={t('settings.modelSection.apiBasePlaceholder')}
            className="text-nb-text-soft w-full bg-nb-raised border border-nb-border rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-500 transition-colors" />
          <p className="mt-1 text-[10px] text-nb-text-muted leading-relaxed">
            {t('settings.modelSection.apiBaseHint')}
          </p>
        </div>
      )}

      {/* 模型列表 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs text-nb-text-dim">
            {t('settings.modelSection.availableModels')}
            {row.models.length > 0 && <span className="text-nb-text-muted"> · {row.models.length}</span>}
          </label>
          <button onClick={() => void syncModels()} disabled={fetching || !row.apiKey}
            title={t('settings.modelSection.fetchModels')}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-nb-border text-nb-text-dim hover:border-brand-500 hover:text-brand-400 disabled:opacity-40 transition-colors">
            {fetching ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
            {t('settings.modelSection.fetchModels')}
          </button>
        </div>

        {fetchNote && (
          <p className={`mb-2 text-[10px] ${fetchNote.ok ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
            {fetchNote.text}
          </p>
        )}

        {/* 已配置的模型 */}
        {row.models.length > 0 && (
          <>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {visibleModels.map(m => (
                <div key={m.value} title={m.value} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-nb-raised border border-nb-border text-xs max-w-full">
                  <span className="text-nb-text-soft truncate">{m.label}</span>
                  {m.value.endsWith(':free') && (
                    <span className="shrink-0 text-[9px] px-1 rounded bg-green-500/15 text-green-600 dark:text-green-400">
                      {t('settings.modelSection.freeBadge')}
                    </span>
                  )}
                  <button onClick={() => removeModel(m.value)} aria-label={t('settings.modelSection.removeModel', { name: m.label })}
                    className="shrink-0 text-nb-text-muted hover:text-red-400">
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
            {row.models.length > visibleModels.length && (
              <button onClick={() => setShowAll(true)}
                className="mb-2 text-[10px] text-nb-text-muted hover:text-brand-400">
                {t('settings.modelSection.showAllModels', { count: row.models.length })}
              </button>
            )}
          </>
        )}

        {/* 添加自定义模型 */}
        <div className="flex gap-2 mb-2">
          <input value={row.newModelLabel} onChange={e => onChange({ newModelLabel: e.target.value })}
            placeholder={t('settings.modelSection.displayName')}
            className="text-nb-text-soft flex-1 bg-nb-raised border border-nb-border rounded-lg px-2 py-1.5 text-xs outline-none focus:border-brand-500" />
          <input value={row.newModelValue} onChange={e => onChange({ newModelValue: e.target.value })}
            placeholder={t('settings.modelSection.modelId')}
            className="text-nb-text-soft flex-1 bg-nb-raised border border-nb-border rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:border-brand-500" />
          <button onClick={addModel} disabled={!row.newModelLabel.trim() || !row.newModelValue.trim()}
            aria-label={t('settings.modelSection.add')}
            className="px-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-40 transition-colors">
            <Plus size={14} />
          </button>
        </div>

        {/* 推荐模型 */}
        {suggestedModels.length > 0 && (
          <div>
            <p className="text-[10px] text-nb-text-muted mb-1">{t('settings.modelSection.suggestedModels')}</p>
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

      {/* 保存：写入 Key，然后自动同步全部模型（免费与非免费） */}
      <button onClick={handleSave} disabled={fetching}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-nb-card border border-nb-border hover:bg-nb-raised text-nb-text-soft disabled:opacity-50 transition-colors">
        {saveState === 'saving' || fetching ? <Loader2 size={12} className="animate-spin" /> :
         saveState === 'saved' ? <CheckCircle size={12} className="text-green-600 dark:text-green-400" /> :
         <Save size={12} />}
        {fetching ? t('settings.modelSection.fetchingModels')
          : saveState === 'saved' ? t('settings.modelSection.savedApi')
          : t('settings.modelSection.saveApi')}
      </button>
    </div>
  )
}

// 服务商显示名称（品牌名保持拉丁文，自定义项走翻译）
const PROVIDER_LABELS: Record<string, string> = {
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  gemini: 'Google Gemini',
  groq: 'Groq',
  minimax: 'MiniMax',
  moonshot: 'Moonshot',
  zhipu: 'Zhipu AI',
  dashscope: 'Qwen (DashScope)',
  volcengine: 'Volcano Engine',
  siliconflow: 'SiliconFlow',
  aihubmix: 'AIHubMix',
  azure_openai: 'Azure OpenAI',
  vllm: 'vLLM',
}

function providerLabel(t: TFunction, name: string): string {
  if (name === 'custom') return t('settings.providers.custom')
  return PROVIDER_LABELS[name] || name
}

// ── 技能标签页 ────────────────────────────────────────────────────────────────

function SkillsTab() {
  const { t } = useTranslation()
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [installUrl, setInstallUrl] = useState('')
  const [installName, setInstallName] = useState('')
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState('')
  const [showAnthropic, setShowAnthropic] = useState(false)
  const [hubSkills, setHubSkills] = useState<Array<{ id: string; name: string; description: string; url: string; source: string }>>([])
  const [hubLoading, setHubLoading] = useState(false)
  const [hubError, setHubError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const hubSkillsCache = useRef<Array<{ id: string; name: string; description: string; url: string; source: string }>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try { const d = await listSkills(); setSkills(d.skills) } finally { setLoading(false) }
  }, [])

  useEffect(() => { reload() }, [reload])

  // 搜索 Anthropic Skills（通过后端 Contents API 做过滤，避免 GitHub Search API 限速）
  const searchAnthropicSkills = async () => {
    const query = searchQuery.trim()
    if (!query) {
      await loadAnthropicHub()
      return
    }
    setSearching(true)
    setHubError('')
    try {
      // 优先用缓存，否则调 API
      const skills = hubSkillsCache.current.length > 0 ? hubSkillsCache.current : (await listAnthropicSkills()).skills
      const q = query.toLowerCase()
      const filtered = skills.filter((s: any) =>
        s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
      )
      setHubSkills(filtered)
    } catch (err) {
      setHubError(t('settings.skills.searchFailed', { error: String(err) }))
    } finally {
      setSearching(false)
    }
  }

  const loadAnthropicHub = async () => {
    setShowAnthropic(true)
    setHubLoading(true)
    setHubError('')
    setSearchQuery('')
    try {
      const d = await listAnthropicSkills()
      hubSkillsCache.current = d.skills
      setHubSkills(d.skills)
    } catch (err) {
      setHubError(t('settings.skills.loadFailed', { error: String(err) }))
    } finally {
      setHubLoading(false)
    }
  }

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

  // 本地文件安装
  const handleLocalInstall = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setInstalling(true); setError('')
    try {
      // 读取文件内容
      const content = await file.text()
      // 上传到后端（使用新的本地安装 API）
      const skillName = file.name.replace(/\.md$/i, '').replace(/\.txt$/i, '') || 'local-skill'
      await installLocalSkill(skillName, content)
      await reload()
    } catch (err) {
      setError(t('settings.skills.localInstallFailed', { error: String(err) }))
    } finally {
      setInstalling(false)
      // 重置 input
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-8">
      {/* 已安装 */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-nb-text-muted mb-4 flex items-center gap-2">
          {t('settings.skills.installed')} {loading && <Loader2 size={12} className="animate-spin" />}
        </h3>
        {skills.length === 0 && !loading
          ? <div className="flex items-center gap-2 text-sm text-nb-text-muted py-2"><BookOpen size={14} />{t('settings.skills.noSkills')}</div>
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

      {/* Anthropic Skills Hub */}
      <section>
        {!showAnthropic ? (
          <>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-nb-text-muted mb-4">{t('settings.skills.hubTitle')}</h3>
            <button
              onClick={loadAnthropicHub}
              className="flex items-center gap-3 p-4 rounded-xl border border-nb-border bg-nb-card hover:border-brand-500/50 transition-colors text-left w-full"
            >
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0">
                <Sparkles size={20} className="text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-medium">{t('settings.skills.anthropicTitle')}</p>
                <p className="text-xs text-nb-text-muted">{t('settings.skills.hubDesc')}</p>
              </div>
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-nb-text-muted">{t('settings.skills.anthropicTitle')}</h3>
              <button
                onClick={() => setShowAnthropic(false)}
                className="text-xs text-nb-text-muted hover:text-nb-text-soft transition-colors"
              >
                {t('settings.skills.collapse')}
              </button>
            </div>

            {/* 搜索框 */}
            <div className="flex gap-2 mb-4">
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') searchAnthropicSkills() }}
                placeholder={t('settings.skills.searchPlaceholder')}
                className="text-nb-text-soft flex-1 bg-nb-card border border-nb-border rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
              <button
                onClick={searchAnthropicSkills}
                disabled={searching}
                className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
              >
                {searching ? <Loader2 size={14} className="animate-spin" /> : t('settings.skills.search')}
              </button>
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); loadAnthropicHub() }}
                  className="px-3 py-2 rounded-xl bg-nb-card border border-nb-border text-nb-text-muted hover:text-nb-text-soft transition-colors"
                >
                  {t('settings.skills.clear')}
                </button>
              )}
            </div>

            {/* 技能列表 */}
            <div className="space-y-2">
              {hubLoading || searching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-brand-400" />
                </div>
              ) : hubError ? (
                <div className="flex items-start gap-2 text-xs bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-300 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400 rounded-xl px-3 py-2">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />{hubError}
                </div>
              ) : hubSkills.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-nb-text-muted py-4">
                  <BookOpen size={14} />{searchQuery ? t('settings.skills.noMatches') : t('settings.skills.noAvailable')}
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {hubSkills.map(s => {
                    const installed = skills.some(sk => sk.id.toLowerCase() === s.id.toLowerCase())
                    return (
                      <div key={s.id} className="flex items-center justify-between gap-3 bg-nb-card border border-nb-border rounded-2xl px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{s.name}</p>
                          <p className="text-xs text-nb-text-muted line-clamp-1">{s.description}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a href={s.url} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 rounded-lg hover:bg-nb-raised text-nb-text-muted hover:text-nb-text-soft transition-colors"
                            title={t('settings.skills.viewSource')}>
                            <ExternalLink size={13} />
                          </a>
                          {installed
                            ? <span className="text-xs text-green-600 dark:text-green-400 font-medium">{t('settings.skills.installedBadge')}</span>
                            : <button onClick={() => handleInstall(s.url, s.id.toLowerCase())} disabled={installing}
                                className="text-xs px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white transition-colors font-medium">
                                {t('settings.skills.install')}
                              </button>
                          }
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* 本地安装 */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-nb-text-muted mb-4">{t('settings.skills.localInstall')}</h3>
        <div className="space-y-3">
          <p className="text-xs text-nb-text-muted">{t('settings.skills.localInstallDesc')}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt"
            onChange={handleLocalInstall}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={installing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-nb-card border border-nb-border hover:border-brand-500/50 text-sm font-medium transition-colors"
          >
            {installing ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {t('settings.skills.chooseFile')}
          </button>
        </div>
      </section>

      {/* 从 URL 安装 */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-nb-text-muted mb-4">{t('settings.skills.installFromUrl')}</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-nb-text-dim mb-1">{t('settings.skills.skillUrl')}</label>
            <input value={installUrl} onChange={e => setInstallUrl(e.target.value)}
              placeholder="https://…/skill.md"
              className="text-nb-text-soft w-full bg-nb-card border border-nb-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="block text-xs text-nb-text-dim mb-1">{t('settings.skills.dirName')} <span className="text-nb-text-muted">({t('common.optional')})</span></label>
            <input value={installName} onChange={e => setInstallName(e.target.value)}
              placeholder="my-skill"
              className="text-nb-text-soft w-full bg-nb-card border border-nb-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
          </div>
          {error && (
            <div className="flex items-start gap-2 text-xs bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 rounded-xl px-3 py-2">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />{error}
            </div>
          )}
          <button onClick={() => handleInstall()} disabled={!installUrl.trim() || installing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-medium transition-colors">
            {installing ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {t('settings.skills.installSkill')}
          </button>
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
  const { t } = useTranslation()
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
    if (!form.name.trim()) { setError(t('settings.mcp.errName')); return }
    if (form.type === 'stdio' && !form.command.trim()) { setError(t('settings.mcp.errCommand')); return }
    if (form.type === 'http' && !form.url.trim()) { setError(t('settings.mcp.errUrl')); return }
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
          {t('settings.mcp.title')} {loading && <Loader2 size={12} className="animate-spin" />}
        </h3>
        <button onClick={openAdd} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white transition-colors font-medium">
          <Plus size={12} /> {t('settings.mcp.add')}
        </button>
      </div>

      {servers.length === 0 && !loading && <p className="text-sm text-nb-text-muted py-2">{t('settings.mcp.empty')}</p>}
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
              <button onClick={async () => { if (!confirm(t('settings.mcp.deleteConfirm', { name: s.name }))) return; await deleteMCPServer(s.name); setServers(p => p.filter(x => x.name !== s.name)) }}
                title={t('settings.mcp.deleteConfirm', { name: s.name })}
                aria-label={t('settings.mcp.deleteConfirm', { name: s.name })}
                className="p-1.5 rounded-lg hover:bg-nb-raised text-nb-text-muted hover:text-red-600 dark:hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>

      {/* 表单 */}
      {showForm && (
        <div className="bg-nb-card border border-nb-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">{editingName ? t('settings.mcp.editTitle', { name: editingName }) : t('settings.mcp.newTitle')}</h4>
            <button onClick={() => setShowForm(false)} title={t('common.close')} aria-label={t('common.close')} className="p-1 rounded-lg hover:bg-nb-raised text-nb-text-dim"><X size={14} /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-nb-text-dim mb-1">{t('settings.mcp.name')}</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="my-server"
                className="text-nb-text-soft w-full bg-nb-raised border border-nb-border rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="block text-xs text-nb-text-dim mb-1">{t('settings.mcp.type')}</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'stdio' | 'http' }))}
                className="text-nb-text-soft w-full bg-nb-raised border border-nb-border rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-500">
                <option value="stdio">{t('settings.mcp.typeStdio')}</option>
                <option value="http">{t('settings.mcp.typeHttp')}</option>
              </select>
            </div>
          </div>
          {form.type === 'stdio' ? (<>
            <div>
              <label className="block text-xs text-nb-text-dim mb-1">{t('settings.mcp.command')}</label>
              <input value={form.command} onChange={e => setForm(f => ({ ...f, command: e.target.value }))} placeholder="npx"
                className="text-nb-text-soft w-full bg-nb-raised border border-nb-border rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="block text-xs text-nb-text-dim mb-1">{t('settings.mcp.args')}</label>
              <input value={form.args} onChange={e => setForm(f => ({ ...f, args: e.target.value }))} placeholder='["-y", "@mcp/server"]'
                className="text-nb-text-soft w-full bg-nb-raised border border-nb-border rounded-xl px-3 py-2 text-sm font-mono outline-none focus:border-brand-500" />
            </div>
          </>) : (<>
            <div>
              <label className="block text-xs text-nb-text-dim mb-1">{t('settings.mcp.url')}</label>
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://mcp.example.com/sse"
                className="text-nb-text-soft w-full bg-nb-raised border border-nb-border rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="block text-xs text-nb-text-dim mb-1">{t('settings.mcp.headers')}</label>
              <input value={form.headers} onChange={e => setForm(f => ({ ...f, headers: e.target.value }))} placeholder='{"Authorization":"Bearer …"}'
                className="text-nb-text-soft w-full bg-nb-raised border border-nb-border rounded-xl px-3 py-2 text-sm font-mono outline-none focus:border-brand-500" />
            </div>
          </>)}
          <div>
            <label className="block text-xs text-nb-text-dim mb-1">{t('settings.mcp.timeout')}</label>
            <input type="number" value={form.toolTimeout} onChange={e => setForm(f => ({ ...f, toolTimeout: e.target.value }))}
              className="text-nb-text-soft w-24 bg-nb-raised border border-nb-border rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-500" />
          </div>
          {error && <div className="flex items-start gap-2 text-xs bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 rounded-xl px-3 py-2"><AlertCircle size={13} className="shrink-0 mt-0.5" />{error}</div>}
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-sm font-medium transition-colors">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {editingName ? t('settings.mcp.update') : t('settings.mcp.add')}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl bg-nb-card border border-nb-border hover:bg-nb-raised text-nb-text-soft text-sm transition-colors">{t('settings.mcp.cancel')}</button>
          </div>
        </div>
      )}

      {/* 快速模板 */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-nb-text-muted mb-4">{t('settings.mcp.templates')}</h3>
        <div className="space-y-2">
          {MCP_TEMPLATES.map(tmpl => {
            const installed = servers.some(s => s.name === tmpl.name)
            return (
              <div key={tmpl.name} className="flex items-center justify-between gap-3 bg-nb-card border border-nb-border rounded-2xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{tmpl.name}</p>
                  <p className="text-xs text-nb-text-muted">{t(`settings.mcp.templateDesc.${tmpl.name}`)}</p>
                  <p className="text-xs text-nb-text-muted font-mono">{tmpl.command} {tmpl.args.join(' ')}</p>
                </div>
                {installed
                  ? <span className="text-xs text-green-600 dark:text-green-400 font-medium shrink-0">{t('settings.mcp.addedBadge')}</span>
                  : <button
                      onClick={async () => { setSaving(true); try { await addMCPServer({ name: tmpl.name, type: tmpl.type, command: tmpl.command, args: tmpl.args, toolTimeout: 30 }); await reload() } finally { setSaving(false) } }}
                      disabled={saving}
                      className="text-xs px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white transition-colors font-medium shrink-0">
                      {t('settings.mcp.addShort')}
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

type MemorySubTab = 'prompt' | 'archive' | 'skills'

function MemoryTab() {
  const { t } = useTranslation()
  const [subTab, setSubTab] = useState<MemorySubTab>('prompt')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 p-1 bg-nb-raised rounded-lg w-fit">
        {([
          { id: 'prompt', label: t('settings.memory.prompt') },
          { id: 'archive', label: t('settings.memory.archive') },
          { id: 'skills', label: t('settings.memory.skills') },
        ] as const).map(item => (
          <button
            key={item.id}
            onClick={() => setSubTab(item.id)}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              subTab === item.id
                ? 'bg-nb-card text-nb-text shadow-sm'
                : 'text-nb-text-soft hover:text-nb-text'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {subTab === 'prompt' && <PromptMemoryPanel />}
      {subTab === 'archive' && <ArchivePanel />}
      {subTab === 'skills' && <SkillMemoryPanel />}
    </div>
  )
}

// ── L1 Prompt Memory Panel ───────────────────────────────────────────────────

function PromptMemoryPanel() {
  const { t } = useTranslation()
  const [items, setItems] = useState<{ id: string; content: string; createdAt: number; tags?: string[] }[]>([])
  const [newText, setNewText] = useState('')
  const [loading, setLoading] = useState(true)
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    if (loadedRef.current) return
    loadedRef.current = true
    setLoading(true)
    try { setItems(await listPromptMemory()) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!newText.trim()) return
    const entry = await addPromptMemory(newText.trim())
    setItems(prev => [...prev, entry])
    setNewText('')
  }

  const handleDelete = async (id: string) => {
    await deletePromptMemory(id)
    setItems(prev => prev.filter(m => m.id !== id))
  }

  const handleClear = async () => {
    if (!confirm(t('settings.memory.clearAllConfirm'))) return
    await clearPromptMemory()
    setItems([])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 p-3.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/30 rounded-xl text-xs text-blue-700 dark:text-blue-300">
        <Brain size={14} className="shrink-0 mt-0.5" />
        <span>{t('settings.memory.promptHint')}</span>
      </div>

      <div className="flex gap-2">
        <input
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          placeholder={t('settings.memoryPlaceholder')}
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

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-nb-text-muted" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-nb-text-muted">
          <Brain size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t('settings.memory.noMemory')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(m => (
            <div key={m.id} className="flex items-start gap-2 p-3 bg-nb-card rounded-lg group border border-nb-border-soft">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-nb-text-soft leading-relaxed break-words">{m.content}</p>
                {(m.tags && m.tags.length > 0) && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {m.tags.map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 bg-nb-raised rounded text-[10px] text-nb-text-dim">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleDelete(m.id)}
                className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-nb-raised text-nb-text-dim hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button onClick={handleClear} className="w-full text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 py-1.5 transition-colors">
            {t('settings.memory.clearAll')}
          </button>
        </div>
      )}
    </div>
  )
}

// ── L2 Archive Panel ─────────────────────────────────────────────────────────

function ArchivePanel() {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<{ session_id: string; message_count: number; last_active: number }[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ session_id: string; role: string; content: string; created_at: number; score: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    if (loadedRef.current) return
    loadedRef.current = true
    setLoading(true)
    try {
      const data = await listArchiveSessions()
      setSessions(data.sessions)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const data = await searchArchive(query.trim(), 20)
      setResults(data.results)
    } finally {
      setSearching(false)
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm(t('settings.memory.deleteArchiveConfirm', { id: `${sessionId.slice(0, 8)}…` }))) return
    await clearArchiveSession(sessionId)
    setSessions(prev => prev.filter(s => s.session_id !== sessionId))
  }

  const handleClearAll = async () => {
    if (!confirm(t('settings.memory.clearAllArchiveConfirm'))) return
    await clearAllArchive()
    setSessions([])
    setResults([])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 rounded-xl text-xs text-amber-700 dark:text-amber-300">
        <Search size={14} className="shrink-0 mt-0.5" />
        <span>{t('settings.memory.archiveHint')}</span>
      </div>

      <div className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
          placeholder={t('settings.memory.searchPlaceholder')}
          className="flex-1 bg-nb-card border border-nb-border rounded-lg px-3 py-2 text-sm text-nb-text-soft placeholder:text-nb-text-muted outline-none focus:border-brand-500"
        />
        <button
          onClick={handleSearch}
          disabled={!query.trim() || searching}
          title={t('settings.memory.searchResults')}
          aria-label={t('settings.memory.searchResults')}
          className="shrink-0 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-sm text-white transition-colors"
        >
          {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        </button>
      </div>

      {results.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin pr-1">
          <div className="text-xs text-nb-text-dim">{t('settings.memory.searchResults')}</div>
          {results.map((r, idx) => (
            <div key={idx} className="p-2.5 bg-nb-card rounded-lg border border-nb-border-soft text-xs space-y-1">
              <div className="flex items-center gap-2 text-nb-text-dim">
                <span className="px-1.5 py-0.5 bg-nb-raised rounded text-[10px]">{r.role}</span>
                <span>{formatDateTime(r.created_at * 1000)}</span>
                <span className="text-[10px] opacity-60">score: {Number(r.score).toFixed(3)}</span>
              </div>
              <p className="text-nb-text-soft line-clamp-3">{r.content}</p>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-nb-text-dim">{t('settings.memory.sessionList')}</div>
          {sessions.length > 0 && (
            <button onClick={handleClearAll} className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors">
              {t('settings.memory.clearAllArchive')}
            </button>
          )}
        </div>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-nb-text-muted" /></div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-6 text-nb-text-muted text-sm">{t('settings.memory.noArchiveSessions')}</div>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto scrollbar-thin pr-1">
            {sessions.map(s => (
              <div key={s.session_id} className="flex items-center gap-3 p-3 bg-nb-card rounded-lg border border-nb-border-soft group">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-nb-text-soft truncate">{s.session_id}</div>
                  <div className="text-xs text-nb-text-dim mt-0.5">
                    {t('settings.memory.messagesCount', {
                      count: s.message_count,
                      time: formatDateTime(s.last_active * 1000),
                    })}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteSession(s.session_id)}
                  title={t('settings.memory.deleteArchiveConfirm', { id: `${s.session_id.slice(0, 8)}…` })}
                  aria-label={t('settings.memory.deleteArchiveConfirm', { id: `${s.session_id.slice(0, 8)}…` })}
                  className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-nb-raised text-nb-text-dim hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── L3 Skill Memory Panel ────────────────────────────────────────────────────

function SkillMemoryPanel() {
  const { t } = useTranslation()
  const [skills, setSkills] = useState<{ name: string; filename: string; title: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<{ name: string; content: string } | null>(null)
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    if (loadedRef.current) return
    loadedRef.current = true
    setLoading(true)
    try {
      const data = await listSkillMemory()
      setSkills(data.skills)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (name: string) => {
    if (!confirm(t('settings.memory.deleteSkillConfirm', { name }))) return
    await deleteSkillMemory(name)
    setSkills(prev => prev.filter(s => s.name !== name))
    if (editing?.name === name) setEditing(null)
  }

  const handleSave = async () => {
    if (!editing) return
    const name = editing.name.trim()
    if (!name) return
    await saveSkillMemory(name, editing.content)
    setEditing(null)
    const data = await listSkillMemory()
    setSkills(data.skills)
  }

  const startNew = () => {
    setEditing({ name: '', content: t('settings.memory.newSkillTemplate') })
  }

  const startEdit = async (name: string) => {
    const data = await getSkillMemory(name)
    setEditing({ name: data.name, content: data.content })
  }

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            value={editing.name}
            onChange={e => setEditing({ ...editing, name: e.target.value })}
            placeholder={t('settings.memory.skillNamePlaceholder')}
            className="flex-1 bg-nb-card border border-nb-border rounded-lg px-3 py-2 text-sm text-nb-text-soft placeholder:text-nb-text-muted outline-none focus:border-brand-500"
          />
          <button
            onClick={() => setEditing(null)}
            className="px-3 py-2 rounded-lg border border-nb-border text-sm text-nb-text-soft hover:bg-nb-raised transition-colors"
          >
            {t('settings.memory.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!editing.name.trim()}
            className="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-sm text-white transition-colors"
          >
            {t('settings.memory.save')}
          </button>
        </div>
        <textarea
          value={editing.content}
          onChange={e => setEditing({ ...editing, content: e.target.value })}
          className="w-full h-80 bg-nb-card border border-nb-border rounded-lg px-3 py-2 text-sm text-nb-text-soft placeholder:text-nb-text-muted outline-none focus:border-brand-500 resize-none font-mono leading-relaxed"
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 p-3.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/30 rounded-xl text-xs text-emerald-700 dark:text-emerald-300">
        <BookOpen size={14} className="shrink-0 mt-0.5" />
        <span>{t('settings.memory.skillsHint')}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-nb-text-dim">{t('settings.memory.skillCount', { count: skills.length })}</div>
        <button
          onClick={startNew}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-brand-600 hover:bg-brand-500 text-xs text-white transition-colors"
        >
          <Plus size={13} />
          {t('settings.memory.newSkill')}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-nb-text-muted" /></div>
      ) : skills.length === 0 ? (
        <div className="text-center py-8 text-nb-text-muted">
          <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t('settings.memory.noSkillDocs')}</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin pr-1">
          {skills.map(s => (
            <div key={s.name} className="flex items-center gap-3 p-3 bg-nb-card rounded-lg border border-nb-border-soft group">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-nb-text-soft truncate">{s.title || s.name}</div>
                <div className="text-xs text-nb-text-dim truncate">{s.filename}</div>
              </div>
              <button
                onClick={() => startEdit(s.name)}
                className="shrink-0 p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-nb-raised text-nb-text-dim hover:text-nb-text transition-colors"
              >
                <Edit2 size={13} />
              </button>
              <button
                onClick={() => handleDelete(s.name)}
                className="shrink-0 p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-nb-raised text-nb-text-dim hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Categories Tab ────────────────────────────────────────────────────────────

function CategoriesTab() {
  const { t } = useTranslation()
  const [categories, setCategories] = useState<CategoryInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState(DEFAULT_ICON_NAME)

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
      setNewIcon(DEFAULT_ICON_NAME)
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
        <div className="flex items-center gap-1.5 px-2 bg-nb-card border border-nb-border rounded-lg shrink-0">
          <ItemIcon name={newIcon} size={15} className="text-brand-400" />
          <select
            value={newIcon}
            onChange={e => setNewIcon(e.target.value)}
            title={t('settings.categories.iconPlaceholder')}
            aria-label={t('settings.categories.iconPlaceholder')}
            className="w-24 bg-transparent text-nb-text-soft text-sm outline-none focus:border-brand-500"
          >
            {ICON_NAMES.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
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
                  <ItemIcon name={categoryIconName(cat)} size={18} className="text-brand-400 shrink-0" />
                  <span className="text-sm text-nb-text-soft truncate">{categoryDisplayName(cat)}</span>
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
                    <ItemIcon name={categoryIconName(cat)} size={18} className="text-brand-400 shrink-0" />
                    <span className="flex-1 text-sm text-nb-text-soft truncate">{categoryDisplayName(cat)}</span>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      title={t('settings.delete')}
                      aria-label={t('settings.delete')}
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

// ── Cookies Tab ────────────────────────────────────────────────────────────────

function CookiesTab() {
  const { t } = useTranslation()
  const eAPI = (window as any).electronAPI

  const [cookies, setCookies] = useState<CookieItem[]>([])
  const [domainFilter, setDomainFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [clearing, setClearing] = useState(false)

  // Add cookie form state
  const [addUrl, setAddUrl] = useState('')
  const [addName, setAddName] = useState('')
  const [addValue, setAddValue] = useState('')
  const [addDomain, setAddDomain] = useState('')
  const [addPath, setAddPath] = useState('/')
  const [addSecure, setAddSecure] = useState(false)
  const [addHttpOnly, setAddHttpOnly] = useState(false)
  const [addSameSite, setAddSameSite] = useState<string>('lax')

  const loadCookies = useCallback(async (domain?: string) => {
    if (!eAPI?.getCookies) return
    setLoading(true)
    try {
      const list = await eAPI.getCookies(domain || undefined)
      setCookies(list)
    } finally {
      setLoading(false)
    }
  }, [eAPI])

  useEffect(() => { loadCookies(domainFilter || undefined) }, [loadCookies, domainFilter])

  const handleFilter = () => {
    loadCookies(domainFilter || undefined)
  }

  const handleDelete = async (url: string, name: string) => {
    if (!eAPI?.removeCookie) return
    await eAPI.removeCookie({ url, name })
    await loadCookies(domainFilter || undefined)
  }

  const handleClearAll = async () => {
    if (!eAPI?.clearAllCookies) return
    setClearing(true)
    try {
      await eAPI.clearAllCookies()
      setCookies([])
    } finally {
      setClearing(false)
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!eAPI?.setCookie || !addUrl || !addName) return
    setAdding(true)
    try {
      await eAPI.setCookie({
        url: addUrl, name: addName, value: addValue,
        domain: addDomain || undefined,
        path: addPath || '/',
        secure: addSecure,
        httpOnly: addHttpOnly,
        sameSite: addSameSite,
      })
      setAddUrl(''); setAddName(''); setAddValue('')
      setAddDomain(''); setAddPath('/'); setAddSecure(false); setAddHttpOnly(false)
      setAddSameSite('lax')
      await loadCookies(domainFilter || undefined)
    } finally {
      setAdding(false)
    }
  }

  const filteredCookies = cookies

  return (
    <div className="space-y-6">
      {/* Filter */}
      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2">
          <Globe size={15} className="text-nb-text-dim shrink-0" />
          <input
            type="text"
            value={domainFilter}
            onChange={e => setDomainFilter(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleFilter()}
            placeholder={t('settings.cookieDomainPlaceholder')}
            className="flex-1 bg-nb-input border border-nb-border rounded-lg px-3 py-2 text-sm text-nb-text placeholder:text-nb-text-muted focus:outline-none focus:border-brand-500/50"
          />
        </div>
        <button onClick={handleFilter} className="px-3 py-2 bg-brand-500/10 hover:bg-brand-500/20 text-brand-500 rounded-lg text-sm font-medium transition-all">
          {t('settings.filter')}
        </button>
        <button
          onClick={handleClearAll}
          disabled={clearing || cookies.length === 0}
          className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {clearing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          {t('settings.clearAll')}
        </button>
      </div>

      {/* Cookie List */}
      <div className="border border-nb-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-nb-card/60 border-b border-nb-border">
            <tr>
              <th className="text-left px-4 py-2.5 text-nb-text-dim font-medium text-xs uppercase tracking-wider">{t('settings.cookieName')}</th>
              <th className="text-left px-4 py-2.5 text-nb-text-dim font-medium text-xs uppercase tracking-wider hidden md:table-cell">{t('settings.cookieDomain')}</th>
              <th className="text-left px-4 py-2.5 text-nb-text-dim font-medium text-xs uppercase tracking-wider hidden lg:table-cell">{t('settings.cookiePath')}</th>
              <th className="text-left px-4 py-2.5 text-nb-text-dim font-medium text-xs uppercase tracking-wider">{t('settings.cookieSecure')}</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-nb-border/50">
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-nb-text-dim">
                  <Loader2 size={20} className="animate-spin mx-auto" />
                </td>
              </tr>
            ) : filteredCookies.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-nb-text-dim text-sm">
                  {domainFilter ? (t('settings.noCookiesFiltered')) : (t('settings.noCookies'))}
                </td>
              </tr>
            ) : filteredCookies.map((c) => (
              <tr key={`${c.domain}-${c.path}-${c.name}`} className="hover:bg-nb-card/40 transition-colors">
                <td className="px-4 py-2.5">
                  <span className="text-nb-text font-mono text-xs break-all">{c.name}</span>
                </td>
                <td className="px-4 py-2.5 text-nb-text-dim text-xs hidden md:table-cell">{c.domain}</td>
                <td className="px-4 py-2.5 text-nb-text-dim text-xs hidden lg:table-cell">{c.path}</td>
                <td className="px-4 py-2.5">
                  {c.secure
                    ? <span className="text-green-400 text-xs">✓</span>
                    : <span className="text-nb-text-muted text-xs">—</span>}
                </td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => handleDelete(`https://${c.domain}${c.path}`, c.name)}
                    className="p-1.5 rounded-lg hover:bg-red-500/15 text-red-400/60 hover:text-red-400 transition-all"
                    title={t('settings.delete')}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Cookie Form */}
      <details className="group">
        <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-nb-text-dim hover:text-nb-text-soft transition-colors list-none">
          <Plus size={14} />
          {t('settings.addCookie')}
          <span className="ml-auto group-open:rotate-45 transition-transform duration-200">
            <Plus size={14} />
          </span>
        </summary>
        <form onSubmit={handleAdd} className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs text-nb-text-dim mb-1">{t('settings.cookieUrl')} *</label>
            <input value={addUrl} onChange={e => setAddUrl(e.target.value)} required placeholder="https://example.com"
              className="w-full bg-nb-input border border-nb-border rounded-lg px-3 py-2 text-sm text-nb-text placeholder:text-nb-text-muted focus:outline-none focus:border-brand-500/50" />
          </div>
          <div>
            <label className="block text-xs text-nb-text-dim mb-1">{t('settings.cookieName')} *</label>
            <input value={addName} onChange={e => setAddName(e.target.value)} required placeholder="session_id"
              className="w-full bg-nb-input border border-nb-border rounded-lg px-3 py-2 text-sm text-nb-text placeholder:text-nb-text-muted focus:outline-none focus:border-brand-500/50" />
          </div>
          <div>
            <label className="block text-xs text-nb-text-dim mb-1">{t('settings.cookieValue')} *</label>
            <input value={addValue} onChange={e => setAddValue(e.target.value)} required placeholder="abc123"
              className="w-full bg-nb-input border border-nb-border rounded-lg px-3 py-2 text-sm text-nb-text placeholder:text-nb-text-muted focus:outline-none focus:border-brand-500/50" />
          </div>
          <div>
            <label className="block text-xs text-nb-text-dim mb-1">{t('settings.cookieDomain')}</label>
            <input value={addDomain} onChange={e => setAddDomain(e.target.value)} placeholder="example.com"
              className="w-full bg-nb-input border border-nb-border rounded-lg px-3 py-2 text-sm text-nb-text placeholder:text-nb-text-muted focus:outline-none focus:border-brand-500/50" />
          </div>
          <div>
            <label className="block text-xs text-nb-text-dim mb-1">{t('settings.cookiePath')}</label>
            <input value={addPath} onChange={e => setAddPath(e.target.value)} placeholder="/"
              className="w-full bg-nb-input border border-nb-border rounded-lg px-3 py-2 text-sm text-nb-text placeholder:text-nb-text-muted focus:outline-none focus:border-brand-500/50" />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-nb-text-dim">
              <input type="checkbox" checked={addSecure} onChange={e => setAddSecure(e.target.checked)}
                className="text-nb-text-soft w-4 h-4 rounded border-nb-border bg-nb-input accent-brand-500" />
              {t('settings.cookieSecure')}
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-nb-text-dim">
              <input type="checkbox" checked={addHttpOnly} onChange={e => setAddHttpOnly(e.target.checked)}
                className="text-nb-text-soft w-4 h-4 rounded border-nb-border bg-nb-input accent-brand-500" />
              HttpOnly
            </label>
          </div>
          <div>
            <label className="block text-xs text-nb-text-dim mb-1">SameSite</label>
            <select value={addSameSite} onChange={e => setAddSameSite(e.target.value)}
              className="w-full bg-nb-input border border-nb-border rounded-lg px-3 py-2 text-sm text-nb-text focus:outline-none focus:border-brand-500/50">
              <option value="lax">Lax</option>
              <option value="strict">Strict</option>
              <option value="none">None</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={adding}
              className="w-full px-4 py-2.5 bg-brand-500 hover:bg-brand-400 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {t('settings.add')}
            </button>
          </div>
        </form>
      </details>
    </div>
  )
}

function AppearanceTab() {
  const { t } = useTranslation()
  const eAPI = (window as any).electronAPI
  const [fxOn,  setFxOn]  = useState(true)
  const [adOn,  setAdOn]  = useState(true)
  const { theme, setTheme, isDark } = useTheme()
  const [maxTokens, setMaxTokens] = useState(0)
  const [maxIterations, setMaxIterations] = useState(0)
  const [searchEngine, setSearchEngine] = useState('bing')

  useEffect(() => {
    eAPI?.getFXEnabled().then(setFxOn).catch(() => {})
    eAPI?.getAdBlockEnabled().then(setAdOn).catch(() => {})
    getAgentLimits().then(limits => {
      setMaxTokens(limits.maxTokens || 0)
      setMaxIterations(limits.maxIterations || 0)
    }).catch(() => {})
    getSearchEngine().then(data => {
      setSearchEngine(data.engine || 'bing')
    }).catch(() => {})

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const handleFX = (v: boolean) => {
    setFxOn(v)
    eAPI?.setFXEnabled(v)
  }
  const handleAd = (v: boolean) => {
    setAdOn(v)
    eAPI?.setAdBlockEnabled(v)
  }
  const debounceRef = useRef<number | null>(null)

  const handleLimitsChange = (tokens: number, iterations: number) => {
    setMaxTokens(tokens)
    setMaxIterations(iterations)
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
    }
    debounceRef.current = window.setTimeout(() => {
      updateAgentLimits(tokens, iterations).catch(() => {})
    }, 500)
  }

  const handleSearchEngineChange = async (engine: string) => {
    setSearchEngine(engine)
    await updateSearchEngine(engine)
  }

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold text-nb-text-muted uppercase tracking-wider mb-4">{t('settings.appearanceBehavior')}</h3>

      {/* Language */}
      <div className="flex items-start gap-4 py-4 border-b border-nb-border-soft">
        <div className="w-9 h-9 rounded-xl bg-nb-card flex items-center justify-center shrink-0 text-brand-400">
          <Globe size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-nb-text">{t('settings.language')}</p>
          <p className="text-xs text-nb-text-muted mt-0.5 leading-relaxed">{t('settings.languageDesc')}</p>
        </div>
        <LanguagePicker className="mt-0.5" />
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
        icon={<ShieldOff size={18} />}
        title={t('settings.adBlock')}
        desc={t('settings.adBlockDesc')}
        checked={adOn}
        onChange={handleAd}
      />

      {/* Agent Limits */}
      <div className="py-4 border-b border-nb-border-soft">
        <div className="flex items-start gap-4">
          <div className="w-9 h-9 rounded-xl bg-nb-card flex items-center justify-center shrink-0 text-brand-400">
            <Terminal size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-nb-text">{t('settings.agentLimits')}</p>
            <p className="text-xs text-nb-text-muted mt-0.5 leading-relaxed">{t('settings.agentLimitsDesc')}</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-nb-text-dim mb-1">{t('settings.maxTokens')}</label>
                <input
                  type="number"
                  min={0}
                  value={maxTokens}
                  onChange={(e) => handleLimitsChange(parseInt(e.target.value) || 0, maxIterations)}
                  className="w-full bg-nb-input border border-nb-border rounded-lg px-3 py-2 text-sm text-nb-text focus:outline-none focus:border-brand-500/50"
                  placeholder={`0 = ${t('common.unlimited')}`}
                />
                <p className="text-[10px] text-nb-text-muted mt-1">{t('settings.maxTokensHint')}</p>
              </div>
              <div>
                <label className="block text-xs text-nb-text-dim mb-1">{t('settings.maxIterations')}</label>
                <input
                  type="number"
                  min={0}
                  value={maxIterations}
                  onChange={(e) => handleLimitsChange(maxTokens, parseInt(e.target.value) || 0)}
                  className="w-full bg-nb-input border border-nb-border rounded-lg px-3 py-2 text-sm text-nb-text focus:outline-none focus:border-brand-500/50"
                  placeholder={`0 = ${t('common.unlimited')}`}
                />
                <p className="text-[10px] text-nb-text-muted mt-1">{t('settings.maxIterationsHint')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search Engine */}
      <div className="py-4 border-b border-nb-border-soft">
        <div className="flex items-start gap-4">
          <div className="w-9 h-9 rounded-xl bg-nb-card flex items-center justify-center shrink-0 text-brand-400">
            <Search size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-nb-text">{t('settings.searchEngine')}</p>
            <p className="text-xs text-nb-text-muted mt-0.5 leading-relaxed">{t('settings.searchEngineDesc')}</p>
            <div className="mt-3">
              <select
                value={searchEngine}
                onChange={(e) => handleSearchEngineChange(e.target.value)}
                className="w-full bg-nb-input border border-nb-border rounded-lg px-3 py-2 text-sm text-nb-text focus:outline-none focus:border-brand-500/50"
              >
                <option value="bing">Bing</option>
                <option value="google">Google</option>
                <option value="baidu">Baidu</option>
                <option value="duckduckgo">DuckDuckGo</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="mt-6 rounded-xl border border-nb-border bg-nb-card/40 p-5">
        <p className="text-xs font-semibold text-nb-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Sparkles size={12} /> {t('settings.fxPreview')}
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
  { id: 'cookies',    labelKey: 'settings.cookies',    icon: <Cookie size={15} /> },
]

function SettingsModal({ open, onClose }: SettingsModalProps) {
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
      style={{ background: 'rgba(13,17,23,0.85)', backdropFilter: 'blur(10px)' }}
      onMouseDown={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="w-full max-w-[680px] h-[640px] flex flex-col bg-nb-base rounded-2xl border border-nb-border shadow-2xl overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-nb-border shrink-0 bg-gradient-to-r from-nb-card/60 to-transparent">
          <h2 className="text-base font-bold flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Settings size={16} className="text-white" />
            </div>
            {t('settings.title')}
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-nb-raised text-nb-text-dim hover:text-nb-text-soft transition-all duration-150 hover:scale-105 active:scale-95">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* 左侧导航 */}
          <div className="w-48 shrink-0 border-r border-nb-border/40 bg-gradient-to-b from-nb-deepest/50 to-transparent p-4 space-y-1.5 overflow-y-auto scrollbar-thin">
            {TABS.map(tabItem => (
              <button key={tabItem.id} onClick={() => setTab(tabItem.id)}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 text-left border ${
                  tab === tabItem.id
                    ? 'bg-brand-500/10 text-brand-500 border-brand-500/25 shadow-sm shadow-brand-500/5'
                    : 'text-nb-text-dim border-transparent hover:text-nb-text-soft hover:bg-nb-card/50'
                }`}>
                <span className={tab === tabItem.id ? 'text-brand-500' : ''}>{tabItem.icon}</span>
                {t(tabItem.labelKey)}
              </button>
            ))}
          </div>

          {/* 内容区域 */}
          <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
            {tab === 'model'      && <ModelTab />}
            {tab === 'skills'     && <SkillsTab />}
            {tab === 'mcp'        && <MCPTab />}
            {tab === 'memory'     && <MemoryTab />}
            {tab === 'categories' && <CategoriesTab />}
            {tab === 'appearance' && <AppearanceTab />}
            {tab === 'cookies'    && <CookiesTab />}
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(SettingsModal)

