import { useState, useEffect, useRef } from 'react'
import { Streamdown } from 'streamdown'
import { X } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import 'streamdown/styles.css'

interface MarkdownRendererProps {
  content: string
  className?: string
}

interface TableModalProps {
  tableHtml: string
  onClose: () => void
  isDark: boolean
}

function TableModal({ tableHtml, onClose, isDark }: TableModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const styles = isDark
    ? {
        overlay: 'rgba(0, 0, 0, 0.7)',
        containerBg: 'rgb(31, 41, 55)',
        containerBorder: 'rgb(55, 65, 81)',
        headerBg: 'rgb(17, 24, 39)',
        headerBorder: 'rgb(55, 65, 81)',
        headerText: 'rgb(249, 250, 251)',
        closeBtn: 'rgb(156, 163, 175)',
        contentBg: 'rgb(31, 41, 55)',
        thBg: 'rgb(55, 65, 81)',
        thText: 'rgb(249, 250, 251)',
        tdText: 'rgb(209, 213, 219)',
        tdBg: 'rgb(31, 41, 55)',
        trHover: 'rgb(55, 65, 81)',
        border: 'rgb(55, 65, 81)'
      }
    : {
        overlay: 'rgba(0, 0, 0, 0.6)',
        containerBg: 'rgb(255, 255, 255)',
        containerBorder: 'rgb(218, 220, 224)',
        headerBg: 'rgb(242, 244, 247)',
        headerBorder: 'rgb(218, 220, 224)',
        headerText: 'rgb(32, 33, 36)',
        closeBtn: 'rgb(68, 71, 70)',
        contentBg: 'rgb(255, 255, 255)',
        thBg: 'rgb(232, 235, 238)',
        thText: 'rgb(32, 33, 36)',
        tdText: 'rgb(68, 71, 70)',
        tdBg: 'rgb(255, 255, 255)',
        trHover: 'rgb(242, 244, 247)',
        border: 'rgb(218, 220, 224)'
      }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: styles.overlay, backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      <div
        className="relative max-w-5xl max-h-[85vh] w-[95vw] rounded-xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: styles.containerBg,
          border: `1px solid ${styles.containerBorder}`,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{
            borderBottom: `1px solid ${styles.headerBorder}`,
            backgroundColor: styles.headerBg
          }}
        >
          <span className="text-sm font-semibold" style={{ color: styles.headerText }}>表格详情</span>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            style={{ color: styles.closeBtn }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isDark ? 'rgb(75, 85, 99)' : 'rgb(214, 217, 222)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <X size={20} />
          </button>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-auto p-6" style={{ backgroundColor: styles.contentBg }}>
          <style>{`
            .modal-table { width: 100%; border-collapse: collapse; }
            .modal-table th, .modal-table td { border: 1px solid ${styles.border} !important; padding: 10px 14px; text-align: left; }
            .modal-table th { background-color: ${styles.thBg} !important; font-weight: 600; color: ${styles.thText}; }
            .modal-table td { color: ${styles.tdText}; background-color: ${styles.tdBg}; }
            .modal-table tr:hover td { background-color: ${styles.trHover} !important; }
          `}</style>
          <div dangerouslySetInnerHTML={{ __html: tableHtml.replace(/<table/g, '<table class="modal-table"') }} />
        </div>
      </div>
    </div>
  )
}

export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const { isDark } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const [modalTable, setModalTable] = useState<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const tables = container.querySelectorAll('table')
    tables.forEach((table) => {
      if (table.parentElement?.classList.contains('table-expand-wrapper')) return

      const wrapper = document.createElement('div')
      wrapper.className = 'table-expand-wrapper relative group'

      const btn = document.createElement('button')
      btn.className = 'absolute top-2 right-2 p-1.5 rounded-lg bg-nb-card/90 border border-nb-border text-nb-text-dim hover:text-nb-text hover:bg-nb-card opacity-0 group-hover:opacity-100 transition-opacity shadow-sm'
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>'
      btn.onclick = (e) => {
        e.stopPropagation()
        const tableClone = table.cloneNode(true) as HTMLElement
        setModalTable(tableClone.outerHTML)
      }

      wrapper.appendChild(btn)
      table.parentNode?.insertBefore(wrapper, table)
      wrapper.appendChild(table)
    })
  }, [content])

  return (
    <div className={className} style={{ '--tw-leading': '1.375' } as React.CSSProperties}>
      <div ref={containerRef}>
        <Streamdown>{content}</Streamdown>
      </div>
      <style>{`
        [data-streamdown] p { margin: 0.25rem 0; }
        [data-streamdown] p + p { margin-top: 0.25rem; }
        [data-streamdown] table { width: 100%; border-collapse: collapse; }
        [data-streamdown] th, [data-streamdown] td { border: 1px solid rgb(var(--nb-border)); padding: 8px 12px; text-align: left; }
        [data-streamdown] th { background: rgb(var(--nb-raised)); font-weight: 600; }
      `}</style>
      {modalTable && <TableModal tableHtml={modalTable} onClose={() => setModalTable(null)} isDark={isDark} />}
    </div>
  )
}
