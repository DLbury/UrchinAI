// In development (Vite dev server), use relative path (proxied)
// In production: use IPC proxy when in Electron (bypasses CORS from app://), else direct fetch
const BASE = import.meta.env.DEV ? '' : 'http://127.0.0.1:8001'
const eAPI = (typeof window !== 'undefined' && (window as any).electronAPI) as { apiRequest?: (method: string, path: string, body?: string) => Promise<unknown> } | undefined

const DEBUG = !import.meta.env.DEV

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase()
  const body = options?.body as string | undefined

  // Use IPC proxy in Electron packaged mode (avoids CORS from app:// origin)
  if (eAPI?.apiRequest && !import.meta.env.DEV) {
    if (DEBUG) console.log('[api] IPC proxy:', method, path)
    try {
      const result = await eAPI.apiRequest(method, path, body) as T
      if (DEBUG) console.log('[api] IPC proxy OK:', path)
      return result
    } catch (err) {
      if (DEBUG) console.error('[api] IPC proxy FAIL:', path, err)
      throw err
    }
  }

  const url = BASE + path
  if (DEBUG) console.log('[api] fetch:', method, url)
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      ...options,
    })
    if (!res.ok) {
      const text = await res.text()
      if (DEBUG) console.error('[api] fetch FAIL:', path, res.status, text)
      throw new Error(`${res.status} ${res.statusText}: ${text}`)
    }
    if (DEBUG) console.log('[api] fetch OK:', path)
    return res.json() as Promise<T>
  } catch (err) {
    if (DEBUG) console.error('[api] fetch ERROR:', path, err)
    throw err
  }
}

// Config
export const getConfig = () => request<{ config: Record<string, unknown> }>('/api/config')
export const updateConfig = (config: Record<string, unknown>) =>
  request('/api/config', { method: 'PUT', body: JSON.stringify({ config }) })
export const getProviders = () => request<{ providers: Record<string, { apiKey?: string; apiBase?: string; models?: { label: string; value: string }[] }> }>('/api/config/providers')
export const updateProvider = (name: string, data: { apiKey?: string; apiBase?: string; models?: { label: string; value: string }[] }) =>
  request('/api/config/providers/' + name, { method: 'PUT', body: JSON.stringify({ name, ...data }) })
export const deleteProvider = (name: string) =>
  request('/api/config/providers/' + name, { method: 'DELETE' })
export const getModel = () => request<{ model: string }>('/api/config/model')
export const updateModel = (model: string, provider?: string) =>
  request('/api/config/model', { method: 'PUT', body: JSON.stringify({ model, provider: provider ?? '' }) })
export const getAgentLimits = () => request<{ maxTokens: number; maxIterations: number }>('/api/config/agent-limits')
export const updateAgentLimits = (maxTokens: number, maxIterations: number) =>
  request('/api/config/agent-limits', { method: 'PUT', body: JSON.stringify({ maxTokens, maxIterations }) })
export const getSearchEngine = () => request<{ engine: string }>('/api/config/search-engine')
export const updateSearchEngine = (engine: string) =>
  request('/api/config/search-engine', { method: 'PUT', body: JSON.stringify({ engine }) })

// Skills
export const listSkills = () => request<{ skills: Array<{ id: string; name: string; description: string }> }>('/api/skills')
export const installSkill = (url: string, name?: string) =>
  request('/api/skills/install', { method: 'POST', body: JSON.stringify({ url, name: name ?? '' }) })
export const installLocalSkill = (name: string, content: string) =>
  request('/api/skills/install-local', { method: 'POST', body: JSON.stringify({ name, content }) })
export const deleteSkill = (id: string) =>
  request('/api/skills/' + id, { method: 'DELETE' })

// Skills Hub
export const listAnthropicSkills = () =>
  request<{ skills: Array<{ id: string; name: string; description: string; url: string; source: string }> }>('/api/skills/hub/anthropic')

// MCP
export const listMCPServers = () =>
  request<{ servers: Array<{ name: string; type: string; command?: string; args?: string[]; url?: string; headers?: Record<string, string>; toolTimeout?: number }> }>('/api/mcp')
export const addMCPServer = (data: Record<string, unknown>) =>
  request('/api/mcp', { method: 'POST', body: JSON.stringify(data) })
export const updateMCPServer = (name: string, data: Record<string, unknown>) =>
  request('/api/mcp/' + name, { method: 'PUT', body: JSON.stringify(data) })
export const deleteMCPServer = (name: string) =>
  request('/api/mcp/' + name, { method: 'DELETE' })

// Bookmarks
export const listBookmarks = () =>
  request<Array<{ url: string; title: string; favicon: string; category?: string; createdAt: number }>>('/api/bookmarks')
export const addBookmark = (url: string, title: string, favicon?: string, category?: string) =>
  request<{ ok: boolean; category?: string }>('/api/bookmarks', { method: 'POST', body: JSON.stringify({ url, title, favicon: favicon ?? '', category: category ?? '' }) })
export const removeBookmark = (url: string) =>
  request('/api/bookmarks?' + new URLSearchParams({ url }), { method: 'DELETE' })
export const categorizeBookmark = (url: string, title: string) =>
  request<{ category: string }>('/api/bookmarks/categorize', { method: 'POST', body: JSON.stringify({ url, title: title ?? '' }) })
export const updateBookmarkCategory = (url: string, category: string) =>
  request('/api/bookmarks/' + encodeURIComponent(url) + '/category', { method: 'PUT', body: JSON.stringify({ category }) })

// History
export const listHistory = (limit = 200) =>
  request<Array<{ url: string; title: string; favicon: string; visitedAt: number }>>(`/api/history?limit=${limit}`)
export const addHistory = (url: string, title: string, favicon?: string) =>
  request('/api/history', { method: 'POST', body: JSON.stringify({ url, title, favicon: favicon ?? '' }) })
export const clearHistory = () => request('/api/history', { method: 'DELETE' })

// ── L1 Prompt Memory ────────────────────────────────────────────────────────
export const listPromptMemory = () =>
  request<Array<{ id: string; content: string; createdAt: number; tags?: string[] }>>('/api/memory/prompt')
export const addPromptMemory = (content: string) =>
  request<{ id: string; content: string; createdAt: number }>('/api/memory/prompt', { method: 'POST', body: JSON.stringify({ content }) })
export const deletePromptMemory = (id: string) => request(`/api/memory/prompt/${id}`, { method: 'DELETE' })
export const clearPromptMemory = () => request('/api/memory/prompt', { method: 'DELETE' })

// ── L2 Session Archive ───────────────────────────────────────────────────────
export const listArchiveSessions = () =>
  request<{ sessions: Array<{ session_id: string; message_count: number; last_active: number }> }>('/api/memory/archive/sessions')
export const searchArchive = (query: string, limit = 10) =>
  request<{ results: Array<{ session_id: string; role: string; content: string; created_at: number; score: number }> }>('/api/memory/archive/search', { method: 'POST', body: JSON.stringify({ query, limit }) })
export const clearArchiveSession = (sessionId: string) =>
  request(`/api/memory/archive/session/${sessionId}`, { method: 'DELETE' })
export const clearAllArchive = () => request('/api/memory/archive', { method: 'DELETE' })

// ── L3 Skill Memory ──────────────────────────────────────────────────────────
export const listSkillMemory = () =>
  request<{ skills: Array<{ name: string; filename: string; title: string }> }>('/api/memory/skills')
export const getSkillMemory = (name: string) =>
  request<{ name: string; content: string }>(`/api/memory/skills/${name}`)
export const saveSkillMemory = (name: string, content: string) =>
  request('/api/memory/skills', { method: 'POST', body: JSON.stringify({ name, content }) })
export const deleteSkillMemory = (name: string) =>
  request(`/api/memory/skills/${name}`, { method: 'DELETE' })

// Back-compat aliases
export const listMemory = listPromptMemory
export const addMemory = addPromptMemory
export const deleteMemory = deletePromptMemory
export const clearMemory = clearPromptMemory

// Scripts
export const listScripts = () =>
  request<Array<{ id: string; name: string; prompt: string; icon: string }>>('/api/scripts')
export const createScript = (name: string, prompt: string, icon?: string) =>
  request<{ id: string; name: string; prompt: string; icon: string }>('/api/scripts', { method: 'POST', body: JSON.stringify({ name, prompt, icon: icon ?? '⚡' }) })
export const updateScript = (id: string, data: { name?: string; prompt?: string; icon?: string }) =>
  request<{ id: string; name: string; prompt: string; icon: string }>(`/api/scripts/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteScript = (id: string) => request(`/api/scripts/${id}`, { method: 'DELETE' })

// Categories
export const listCategories = () =>
  request<Array<{ id: string; name: string; name_en: string; icon: string }>>('/api/categories')
export const addCategory = (name: string, icon?: string, name_en?: string) =>
  request<{ id: string; name: string; name_en: string; icon: string }>('/api/categories', { method: 'POST', body: JSON.stringify({ name, icon: icon ?? '📌', name_en: name_en ?? '' }) })
export const updateCategory = (id: string, data: { name?: string; icon?: string; name_en?: string }) =>
  request<{ id: string; name: string; name_en: string; icon: string }>(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteCategory = (id: string) => request(`/api/categories/${id}`, { method: 'DELETE' })

// Chat Sessions
export const listChatSessions = () =>
  request<{ sessions: Array<{ id: string; name: string; createdAt: number; messages: Array<{ id: string; role: string; content: string; toolCalls?: unknown[]; files?: unknown[]; createdAt: number }> }>; currentSessionId: string }>('/api/chat-sessions')
export const saveChatSessions = (sessions: Array<{ id: string; name: string; createdAt: number; messages: Array<{ id: string; role: string; content: string; toolCalls?: unknown[]; files?: unknown[]; createdAt: number }> }>, currentSessionId: string) =>
  request('/api/chat-sessions', { method: 'PUT', body: JSON.stringify({ sessions, currentSessionId }) })

// Translation
export const translate = (text: string) =>
  request<{ translation: string }>('/api/translate', { method: 'POST', body: JSON.stringify({ text }) })
export const getTranslationConfig = () =>
  request<{ model: string; provider: string; targetLang: string }>('/api/config/translation')
export const updateTranslationConfig = (data: { model: string; provider: string; targetLang: string }) =>
  request('/api/config/translation', { method: 'PUT', body: JSON.stringify(data) })
