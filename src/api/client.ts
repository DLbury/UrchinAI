const BASE = ''  // proxied via vite in dev, same origin in production

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  return res.json() as Promise<T>
}

// Config
export const getConfig = () => request<{ config: Record<string, unknown> }>('/api/config')
export const updateConfig = (config: Record<string, unknown>) =>
  request('/api/config', { method: 'PUT', body: JSON.stringify({ config }) })
export const getProviders = () => request<{ providers: Record<string, { apiKey?: string; apiBase?: string }> }>('/api/config/providers')
export const updateProvider = (name: string, data: { apiKey?: string; apiBase?: string }) =>
  request('/api/config/providers/' + name, { method: 'PUT', body: JSON.stringify({ name, ...data }) })
export const deleteProvider = (name: string) =>
  request('/api/config/providers/' + name, { method: 'DELETE' })
export const getModel = () => request<{ model: string }>('/api/config/model')
export const updateModel = (model: string, provider?: string) =>
  request('/api/config/model', { method: 'PUT', body: JSON.stringify({ model, provider: provider ?? '' }) })

// Skills
export const listSkills = () => request<{ skills: Array<{ id: string; name: string; description: string }> }>('/api/skills')
export const installSkill = (url: string, name?: string) =>
  request('/api/skills/install', { method: 'POST', body: JSON.stringify({ url, name: name ?? '' }) })
export const deleteSkill = (id: string) =>
  request('/api/skills/' + id, { method: 'DELETE' })

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
  request<Array<{ url: string; title: string; favicon: string; createdAt: number }>>('/api/bookmarks')
export const addBookmark = (url: string, title: string, favicon?: string) =>
  request('/api/bookmarks', { method: 'POST', body: JSON.stringify({ url, title, favicon: favicon ?? '' }) })
export const removeBookmark = (url: string) =>
  request('/api/bookmarks?' + new URLSearchParams({ url }), { method: 'DELETE' })

// History
export const listHistory = (limit = 200) =>
  request<Array<{ url: string; title: string; favicon: string; visitedAt: number }>>(`/api/history?limit=${limit}`)
export const addHistory = (url: string, title: string, favicon?: string) =>
  request('/api/history', { method: 'POST', body: JSON.stringify({ url, title, favicon: favicon ?? '' }) })
export const clearHistory = () => request('/api/history', { method: 'DELETE' })

// Memory
export const listMemory = () =>
  request<Array<{ id: string; content: string; createdAt: number }>>('/api/memory')
export const addMemory = (content: string) =>
  request<{ id: string; content: string; createdAt: number }>('/api/memory', { method: 'POST', body: JSON.stringify({ content }) })
export const deleteMemory = (id: string) => request(`/api/memory/${id}`, { method: 'DELETE' })
export const clearMemory = () => request('/api/memory', { method: 'DELETE' })

// Scripts
export const listScripts = () =>
  request<Array<{ id: string; name: string; prompt: string; icon: string }>>('/api/scripts')
export const createScript = (name: string, prompt: string, icon?: string) =>
  request<{ id: string; name: string; prompt: string; icon: string }>('/api/scripts', { method: 'POST', body: JSON.stringify({ name, prompt, icon: icon ?? '⚡' }) })
export const deleteScript = (id: string) => request(`/api/scripts/${id}`, { method: 'DELETE' })
