import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Loader2, CheckCircle, XCircle, Wrench } from 'lucide-react'
import type { ToolCall } from '../types'

function ToolCallCard({ tool }: { tool: ToolCall }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const statusConfig = {
    pending: { icon: Loader2, className: 'animate-spin text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
    running: { icon: Loader2, className: 'animate-spin text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
    done: { icon: CheckCircle, className: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/30' },
    error: { icon: XCircle, className: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  }[tool.status]

  const StatusIcon = statusConfig.icon

  return (
    <div className={`mt-2 rounded-lg border ${statusConfig.border} ${statusConfig.bg} overflow-hidden`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2.5 text-left hover:bg-nb-raised/30 transition-colors"
      >
        <StatusIcon size={14} className={statusConfig.className} />
        <Wrench size={12} className="text-nb-text-dim" />
        <span className="font-mono text-sm text-brand-400 font-medium">{tool.name}</span>
        <span className="text-nb-text-muted text-xs flex-1 truncate">
          ({Object.keys(tool.args).join(', ')})
        </span>
        {expanded ? <ChevronDown size={14} className="text-nb-text-dim" /> : <ChevronRight size={14} className="text-nb-text-dim" />}
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

export function ToolCallsGroup({ tools }: { tools: ToolCall[] }) {
  const [expanded, setExpanded] = useState(false)
  if (!tools.length) return null

  const pendingCount = tools.filter((t) => t.status === 'pending' || t.status === 'running').length
  const doneCount = tools.filter((t) => t.status === 'done').length
  const errorCount = tools.filter((t) => t.status === 'error').length

  const names = tools.map((t) => t.name)
  const uniqueNames = Array.from(new Set(names))
  const summaryNames = uniqueNames.slice(0, 3).join('、')
  const more = uniqueNames.length > 3 ? `等` : ''

  return (
    <div className="mt-2 rounded-lg border border-nb-border bg-nb-card/40 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2.5 text-left hover:bg-nb-raised/30 transition-colors"
      >
        {pendingCount > 0 ? (
          <Loader2 size={14} className="animate-spin text-blue-500" />
        ) : errorCount > 0 ? (
          <XCircle size={14} className="text-red-500" />
        ) : (
          <CheckCircle size={14} className="text-green-500" />
        )}
        <Wrench size={12} className="text-nb-text-dim" />
        <span className="text-sm text-nb-text-soft">
          已调用 {tools.length} 个工具
          <span className="text-nb-text-muted text-xs ml-1">
            ({summaryNames}{more})
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-nb-text-muted">
          {pendingCount > 0 && <span className="text-blue-500">{pendingCount} 运行中</span>}
          {errorCount > 0 && <span className="text-red-500">{errorCount} 失败</span>}
          {doneCount > 0 && !pendingCount && <span className="text-green-500">{doneCount} 完成</span>}
        </span>
        {expanded ? <ChevronDown size={14} className="text-nb-text-dim ml-2" /> : <ChevronRight size={14} className="text-nb-text-dim ml-2" />}
      </button>
      {expanded && (
        <div className="border-t border-nb-border/50 px-3 pb-3 bg-nb-card/20">
          {tools.map((tool) => (
            <ToolCallCard key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </div>
  )
}
