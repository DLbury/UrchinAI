export interface AttachedFile {
  name: string
  data: string  // base64 data URL
  type: string  // MIME type
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  files?: AttachedFile[]
  toolCalls?: ToolCall[]
  createdAt: number
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  result?: string
  status: 'pending' | 'running' | 'done' | 'error'
}

export interface WSMessage {
  type: 'token' | 'tool_call' | 'tool_result' | 'done' | 'error' | 'history_cleared' | 'stopped'
  content?: string
  name?: string
  args?: Record<string, unknown>
  call_id?: string
  result?: string
  files?: AttachedFile[]
}

export interface Provider {
  name: string
  apiKey?: string
  apiBase?: string
}

export interface ModelConfig {
  model: string
  provider?: string
}

export interface MCPServer {
  name: string
  type: 'stdio' | 'http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  toolTimeout?: number
}

export interface Skill {
  id: string
  name: string
  description: string
}

export type PanelTab = 'config' | 'skills' | 'mcp'
