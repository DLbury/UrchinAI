import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Settings, RefreshCw, ChevronLeft, ChevronRight, Globe,
  Plus, X, Loader2, PanelRightClose, PanelRightOpen,
  Bookmark, BookmarkCheck, Clock, BookOpen, Sparkles, Trash2, Search,
  FolderOpen, Shield, ShieldOff, Minus, Maximize2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from './hooks/useTheme'
import { v4 as uuidv4 } from 'uuid'
import ChatPanel from './components/ChatPanel'
import SettingsModal from './components/SettingsModal'
import NewTabPage from './components/NewTabPage'
import {
  listBookmarks, addBookmark, removeBookmark, updateBookmarkCategory,
  listHistory, addHistory, clearHistory, listCategories,
} from './api/client'
import { getPageContent } from './api/bridge'

// ── Electron IPC bridge ──────────────────────────────────────────────────────
type ElectronAPI = {
  isElectron: boolean
  platform?: 'darwin' | 'win32' | 'linux'
  setActiveWebview:    (id: number)   => Promise<void>
  updateTabState:      (s: unknown)   => Promise<void>
  onCmdNewTab:         (cb: (url: string) => void) => () => void
  onCmdCloseTab:       (cb: () => void)            => () => void
  onCmdSwitchTab:      (cb: (id: string) => void)  => () => void
  onCmdRestoreSession: (cb: (tabs: {url:string;title:string}[]) => void) => () => void
  getAdBlockEnabled:   ()             => Promise<boolean>
  setAdBlockEnabled:   (en: boolean)  => Promise<void>
  saveSession:         (name: string) => Promise<SessionItem>
  getAllSessions:       ()             => Promise<SessionItem[]>
  deleteSession:       (id: string)   => Promise<{ ok: boolean }>
  restoreSession:      (id: string)   => Promise<{ ok: boolean; count: number }>
  openExternal:        (url: string)  => Promise<void>
  onBackendReady:      (cb: () => void) => () => void
  getFXEnabled:        () => Promise<boolean>
  setFXEnabled:        (enabled: boolean) => Promise<void>
  showContextMenu:     (params: Record<string, unknown>) => Promise<void>
  detachTab:           (url: string, screenX: number, screenY: number, theme?: string) => Promise<boolean>
  // Window controls (frameless mode)
  windowMinimize:      () => Promise<void>
  windowMaximize:      () => Promise<void>
  windowClose:         () => Promise<void>
  windowIsMaximized:   () => Promise<boolean>
}
const eAPI: ElectronAPI | undefined = (window as any).electronAPI

// ── Types ────────────────────────────────────────────────────────────────────
interface TabState {
  id:        string
  src:       string   // immutable after creation — used as the <webview src> prop
  url:       string   // current display URL updated from navigation events (address bar only)
  title:     string
  isLoading: boolean
  favicon:   string | null
}
interface BookmarkItem { url: string; title: string; favicon: string; category?: string; createdAt: number }
interface HistoryItem  { url: string; title: string; favicon: string; visitedAt: number }
interface SessionItem  { id: string; name: string; createdAt: number; tabs: {url:string;title:string}[] }

const INITIAL_TAB_ID = uuidv4()
const SESSION_ID     = uuidv4()

// ── TabBar ────────────────────────────────────────────────────────────────────
const TAB_BAR_HEIGHT = 38
const NAV_BAR_HEIGHT = 44

function TabBar({
  tabs, activeId, onSwitch, onClose, onNew, onDetach, onReorder, t,
}: {
  tabs: TabState[]; activeId: string | null
  onSwitch: (id: string) => void; onClose: (id: string) => void
  onNew: () => void
  onDetach: (tab: TabState, screenX: number, screenY: number) => void
  onReorder: (draggedId: string, targetId: string) => void
  t: (key: string) => string
}) {
  const dragTabRef  = useRef<TabState | null>(null)
  const droppedRef  = useRef(false)
  const [dragOverId, setDragOverId]   = useState<string | null>(null)
  const [isDraggingOut, setIsDraggingOut] = useState(false)

  const handleDragStart = (e: React.DragEvent, tab: TabState) => {
    dragTabRef.current = tab
    droppedRef.current = false
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tab.url)
    setIsDraggingOut(false)
  }

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragTabRef.current && dragTabRef.current.id !== targetId) {
      setDragOverId(targetId)
    }
  }

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    const dragged = dragTabRef.current
    if (!dragged || dragged.id === targetId) return
    droppedRef.current = true
    setDragOverId(null)
    onReorder(dragged.id, targetId)
  }

  const handleDragEnd = (e: React.DragEvent, tab: TabState) => {
    if (!droppedRef.current) {
      const outside = e.clientX < 0 || e.clientY < 0 ||
                      e.clientX > window.innerWidth || e.clientY > window.innerHeight
      if (outside) {
        onDetach(tab, e.screenX, e.screenY)
      }
    }
    dragTabRef.current = null
    droppedRef.current = false
    setIsDraggingOut(false)
    setDragOverId(null)
  }

  return (
    <div
      className="flex items-end gap-0 overflow-x-auto scrollbar-none bg-nb-deepest shrink-0"
      style={{ height: TAB_BAR_HEIGHT, WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Logo / App name - drag area */}
      <div className="flex items-center gap-1.5 px-3 h-full text-nb-text-dim shrink-0">
        <Sparkles size={14} className="text-brand-400" />
        <span className="text-xs font-medium">UrchinAI</span>
      </div>
      {tabs.map(tab => {
        const isActive  = tab.id === activeId
        const isDropTarget = dragOverId === tab.id
        return (
          <div key={tab.id}
            draggable
            onDragStart={e => handleDragStart(e, tab)}
            onDragOver={e => handleDragOver(e, tab.id)}
            onDrop={e => handleDrop(e, tab.id)}
            onDragLeave={() => setDragOverId(null)}
            onDragEnd={e => handleDragEnd(e, tab)}
            onClick={() => onSwitch(tab.id)}
            title={t('tabBar.dragHint')}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className={`group relative flex items-center gap-1.5 px-3 min-w-[120px] max-w-[200px] h-[34px]
              rounded-t-lg cursor-grab active:cursor-grabbing select-none shrink-0 transition-colors
              ${isActive ? 'bg-nb-card text-nb-text' : 'bg-nb-base text-nb-text-dim hover:bg-nb-card/60 hover:text-nb-text-soft'}
              ${isDropTarget ? 'ring-2 ring-brand-500/60 ring-inset' : ''}
              ${isDraggingOut && dragTabRef.current?.id === tab.id ? 'opacity-40 scale-95' : ''}`}
          >
            <span className="w-4 h-4 shrink-0 flex items-center justify-center">
              {tab.isLoading ? <Loader2 size={12} className="animate-spin text-brand-400" />
                : tab.favicon ? <img src={tab.favicon} className="w-4 h-4 object-contain" alt="" />
                : <Globe size={12} className="opacity-50" />}
            </span>
            <span className="flex-1 text-xs truncate">{tab.title || tab.url || t('common.newTab')}</span>
            <button onClick={e => { e.stopPropagation(); onClose(tab.id) }}
              className={`shrink-0 w-4 h-4 rounded flex items-center justify-center transition-colors
                ${isActive ? 'opacity-60 hover:opacity-100 hover:bg-nb-hover' : 'opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100 hover:bg-nb-hover'}`}>
              <X size={10} />
            </button>
            {isActive && <span className="absolute bottom-0 left-0 right-0 h-px bg-nb-card" />}
          </div>
        )
      })}
      <button onClick={onNew}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className="shrink-0 w-8 h-8 mb-0.5 ml-1 flex items-center justify-center rounded text-nb-text-muted hover:text-nb-text-soft hover:bg-nb-raised transition-colors">
        <Plus size={14} />
      </button>
      <div className="flex-1" />
      {/* Window controls (Windows/Linux only, macOS uses native traffic lights) */}
      {eAPI && eAPI.platform !== 'darwin' && (
        <div className="flex items-center h-full shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => eAPI.windowMinimize()}
            className="w-11 h-full flex items-center justify-center hover:bg-nb-hover transition-colors"
          >
            <Minus size={14} className="text-nb-text-dim" />
          </button>
          <button
            onClick={async () => eAPI.windowMaximize()}
            className="w-11 h-full flex items-center justify-center hover:bg-nb-hover transition-colors"
          >
            <Maximize2 size={12} className="text-nb-text-dim" />
          </button>
          <button
            onClick={() => eAPI.windowClose()}
            className="w-11 h-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
          >
            <X size={14} className="text-nb-text-dim" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── ReadingModeOverlay ────────────────────────────────────────────────────────
function ReadingModeOverlay({ content, onClose }: { content: { title:string;url:string;text:string }|null; onClose:()=>void }) {
  if (!content) return null
  return (
    <div className="fixed inset-0 z-50 bg-nb-deepest/95 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-8 py-4 border-b border-nb-border-soft bg-nb-base shrink-0">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-nb-text truncate">{content.title}</h1>
          <p className="text-xs text-nb-text-muted truncate mt-0.5">{content.url}</p>
        </div>
        <button onClick={onClose} className="ml-4 shrink-0 p-2 rounded-lg hover:bg-nb-raised text-nb-text-dim hover:text-nb-text-soft transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-6 scrollbar-thin">
        <article className="max-w-2xl mx-auto text-nb-text-soft text-sm leading-7 whitespace-pre-wrap font-serif">
          {content.text}
        </article>
      </div>
    </div>
  )
}

// ── HistoryPanel ──────────────────────────────────────────────────────────────
function HistoryPanel({ items, onNavigate, onClear, onClose, t }: {
  items: HistoryItem[]; onNavigate:(u:string)=>void; onClear:()=>void; onClose:()=>void
  t: (key: string) => string
}) {
  const [search, setSearch] = useState('')
  const filtered = search ? items.filter(h => h.url.includes(search) || h.title.toLowerCase().includes(search.toLowerCase())) : items
  const fmtTime = (ts:number) => new Date(ts*1000).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})

  return (
    <div className="absolute right-0 top-full mt-1 w-96 max-h-[70vh] bg-nb-base border border-nb-border rounded-xl shadow-2xl z-40 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-nb-border shrink-0">
        <span className="text-sm font-semibold text-nb-text flex items-center gap-2"><Clock size={14} className="text-brand-400" /> {t('history.title')}</span>
        <div className="flex items-center gap-1">
          <button onClick={onClear} title={t('history.clearAll')} className="p-1.5 rounded hover:bg-nb-raised text-nb-text-dim hover:text-red-600 dark:hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-nb-raised text-nb-text-dim hover:text-nb-text-soft transition-colors"><X size={13} /></button>
        </div>
      </div>
      <div className="px-3 py-2 border-b border-nb-border shrink-0">
        <div className="flex items-center gap-2 bg-nb-card rounded-lg px-2.5 py-1.5">
          <Search size={12} className="text-nb-text-muted shrink-0" />
          <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('history.searchPlaceholder')}
            className="flex-1 bg-transparent text-xs text-nb-text-soft placeholder:text-nb-text-muted outline-none" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filtered.length===0 ? <div className="flex flex-col items-center justify-center py-10 text-nb-text-muted"><Clock size={28} className="opacity-30 mb-2" /><p className="text-xs">{t('history.empty')}</p></div>
          : filtered.map((h,i)=>(
            <button key={i} onClick={()=>{onNavigate(h.url);onClose()}}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-nb-card transition-colors text-left group">
              {h.favicon ? <img src={h.favicon} className="w-4 h-4 shrink-0 object-contain" alt="" /> : <Globe size={14} className="text-nb-text-muted shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-nb-text-soft truncate group-hover:text-nb-text">{h.title||h.url}</p>
                <p className="text-[10px] text-nb-text-muted truncate">{h.url}</p>
              </div>
              <span className="shrink-0 text-[10px] text-nb-text-muted">{fmtTime(h.visitedAt)}</span>
            </button>
          ))}
      </div>
    </div>
  )
}

// ── BookmarksPanel ────────────────────────────────────────────────────────────

interface CategoryInfo { id: string; name: string; name_en: string; icon: string }

function BookmarksPanel({ items, onNavigate, onRemove, onClose, onCategoryChange, t, i18n }: {
  items: BookmarkItem[]
  onNavigate: (u: string) => void
  onRemove: (u: string) => void
  onCategoryChange: (url: string, category: string) => void
  onClose: () => void
  t: (key: string) => string
  i18n: { language: string }
}) {
  const [categories, setCategories] = useState<CategoryInfo[]>([])
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    listCategories().then(setCategories).catch(() => {})
  }, [])

  // Fallback categorization for items without category
  const fallbackCategorize = (url: string): string => {
    try {
      const host = new URL(url).hostname.toLowerCase()
      const patterns: [string, RegExp][] = [
        ["entertainment", /youtube|bilibili|netflix|iqiyi|youku|vimeo|twitch|douyin/],
        ["social", /twitter|x\.com|facebook|instagram|weibo|linkedin|tiktok|discord/],
        ["shopping", /amazon|taobao|jd\.com|tmall|pinduoduo|ebay|aliexpress|shopify/],
        ["tools", /github|gitlab|stackoverflow|npmjs|pypi|vercel|railway|cloudflare|docker|google|baidu|bing/],
        ["news", /news|bbc|cnn|xinhua|sina\.com|sohu|people\.com|reuters|theguardian/],
        ["ai", /openai|chatgpt|claude|gemini|deepseek|huggingface|cohere|midjourney/],
        ["finance", /bank|alipay|paypal|finance|trading|invest|stock|fund|crypto/],
      ]
      for (const [cat, pattern] of patterns) {
        if (pattern.test(host)) return cat
      }
    } catch {}
    return "other"
  }

  // Get category display info
  const getCategoryInfo = (catId: string): CategoryInfo | undefined => categories.find(c => c.id === catId)
  const getCategoryName = (catId: string): string => {
    const cat = getCategoryInfo(catId)
    return cat ? (i18n.language === 'zh-CN' ? cat.name : (cat.name_en || cat.name)) : catId
  }

  // Group items by category (using fallback for empty categories)
  const groupedItems = items.reduce<Record<string, BookmarkItem[]>>((acc, bm) => {
    const cat = bm.category || fallbackCategorize(bm.url)
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(bm)
    return acc
  }, {})

  // Filter items
  const displayItems = filter === 'all' ? null : (groupedItems[filter] || [])

  return (
    <div className="absolute right-0 top-full mt-1 w-96 max-h-[70vh] bg-nb-base border border-nb-border rounded-xl shadow-2xl z-40 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-nb-border shrink-0">
        <span className="text-sm font-semibold text-nb-text flex items-center gap-2">
          <Bookmark size={14} className="text-brand-400" /> {t('bookmarks.title')}
        </span>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-nb-raised text-nb-text-dim hover:text-nb-text-soft transition-colors">
          <X size={13} />
        </button>
      </div>

      {/* Category filter */}
      <div className="px-3 py-2 border-b border-nb-border shrink-0 overflow-x-auto scrollbar-thin">
        <div className="flex gap-1.5 flex-nowrap">
          <button
            onClick={() => setFilter('all')}
            className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              filter === 'all' ? 'bg-brand-600 text-white' : 'bg-nb-card text-nb-text-dim hover:text-nb-text'
            }`}
          >
            {t('settings.categories')} ({items.length})
          </button>
          {Object.entries(groupedItems).map(([catId, catItems]) => {
            const catInfo = getCategoryInfo(catId)
            return (
              <button
                key={catId}
                onClick={() => setFilter(catId)}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filter === catId ? 'bg-brand-600 text-white' : 'bg-nb-card text-nb-text-dim hover:text-nb-text'
                }`}
              >
                {catInfo?.icon || '📌'} {getCategoryName(catId)} ({catItems.length})
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-nb-text-muted">
            <Bookmark size={28} className="opacity-30 mb-2" />
            <p className="text-xs">{t('bookmarks.empty')}</p>
          </div>
        ) : filter === 'all' ? (
          // Show grouped by category
          Object.entries(groupedItems).map(([catId, catItems]) => {
            const catInfo = getCategoryInfo(catId)
            return (
              <div key={catId}>
                <div className="px-4 py-1.5 bg-nb-raised/50 text-xs font-medium text-nb-text-muted sticky top-0">
                  {catInfo?.icon || '📌'} {getCategoryName(catId)}
                </div>
                {catItems.map((bm, i) => (
                  <BookmarkItemRow
                    key={i}
                    bm={bm}
                    categories={categories}
                    onNavigate={onNavigate}
                    onRemove={onRemove}
                    onCategoryChange={onCategoryChange}
                    onClose={onClose}
                    i18n={i18n}
                  />
                ))}
              </div>
            )
          })
        ) : (
          // Show filtered items
          displayItems?.map((bm, i) => (
            <BookmarkItemRow
              key={i}
              bm={bm}
              categories={categories}
              onNavigate={onNavigate}
              onRemove={onRemove}
              onCategoryChange={onCategoryChange}
              onClose={onClose}
              i18n={i18n}
            />
          ))
        )}
      </div>
    </div>
  )
}

function BookmarkItemRow({ bm, categories, onNavigate, onRemove, onCategoryChange, onClose, i18n }: {
  bm: BookmarkItem
  categories: CategoryInfo[]
  onNavigate: (u: string) => void
  onRemove: (u: string) => void
  onCategoryChange: (url: string, category: string) => void
  onClose: () => void
  i18n: { language: string }
}) {
  const [showCatSelect, setShowCatSelect] = useState(false)

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-nb-card transition-colors group">
      {bm.favicon ? (
        <img src={bm.favicon} className="w-4 h-4 shrink-0 object-contain" alt="" />
      ) : (
        <Globe size={14} className="text-nb-text-muted shrink-0" />
      )}
      <button onClick={() => { onNavigate(bm.url); onClose() }} className="flex-1 min-w-0 text-left">
        <p className="text-xs text-nb-text-soft truncate group-hover:text-nb-text">{bm.title || bm.url}</p>
        <p className="text-[10px] text-nb-text-muted truncate">{bm.url}</p>
      </button>

      {/* Category selector */}
      <div className="relative shrink-0">
        <button
          onClick={() => setShowCatSelect(!showCatSelect)}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-nb-raised text-nb-text-dim hover:text-nb-text-soft transition-colors"
          title="Change category"
        >
          {categories.find(c => c.id === bm.category)?.icon || '📌'}
        </button>
        {showCatSelect && (
          <div className="absolute right-0 top-full mt-1 w-36 bg-nb-base border border-nb-border rounded-lg shadow-xl z-50 py-1 max-h-48 overflow-y-auto">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => { onCategoryChange(bm.url, cat.id); setShowCatSelect(false) }}
                className={`w-full px-2 py-1.5 text-left text-xs hover:bg-nb-card transition-colors flex items-center gap-1.5 ${
                  bm.category === cat.id ? 'text-brand-500 font-medium' : 'text-nb-text-soft'
                }`}
              >
                {cat.icon} {i18n.language === 'zh-CN' ? cat.name : (cat.name_en || cat.name)}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => onRemove(bm.url)}
        className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-nb-raised text-nb-text-dim hover:text-red-600 dark:hover:text-red-400 transition-colors"
      >
        <X size={11} />
      </button>
    </div>
  )
}

// ── SessionsPanel ─────────────────────────────────────────────────────────────
function SessionsPanel({ sessions, onSave, onRestore, onDelete, onClose, t }: {
  sessions: SessionItem[]; onSave:(n:string)=>void; onRestore:(id:string)=>void; onDelete:(id:string)=>void; onClose:()=>void
  t: (key: string) => string
}) {
  const [saveName, setSaveName] = useState('')
  const fmtDate = (ts:number) => new Date(ts).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})

  return (
    <div className="absolute right-0 top-full mt-1 w-80 max-h-[70vh] bg-nb-base border border-nb-border rounded-xl shadow-2xl z-40 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-nb-border shrink-0">
        <span className="text-sm font-semibold text-nb-text flex items-center gap-2"><FolderOpen size={14} className="text-brand-400" /> {t('sessions.title')}</span>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-nb-raised text-nb-text-dim hover:text-nb-text-soft transition-colors"><X size={13} /></button>
      </div>
      <div className="px-3 py-2 border-b border-nb-border shrink-0">
        <div className="flex gap-2">
          <input autoFocus value={saveName} onChange={e=>setSaveName(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&saveName.trim()){onSave(saveName.trim());setSaveName('')}}}
            placeholder={t('sessions.namePlaceholder')} className="flex-1 bg-nb-card rounded-lg px-2.5 py-1.5 text-xs text-nb-text-soft placeholder:text-nb-text-muted outline-none border border-nb-border focus:border-brand-500" />
            <button onClick={()=>{if(saveName.trim()){onSave(saveName.trim());setSaveName('')}}} disabled={!saveName.trim()}
            className="shrink-0 px-2.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-xs text-white transition-colors">{t('common.save')}</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {sessions.length===0 ? <div className="flex flex-col items-center justify-center py-10 text-nb-text-muted"><FolderOpen size={28} className="opacity-30 mb-2" /><p className="text-xs">{t('sessions.empty')}</p></div>
          : sessions.map(s=>(
            <div key={s.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-nb-card transition-colors group">
              <FolderOpen size={14} className="text-nb-text-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-nb-text-soft truncate">{s.name}</p>
                <p className="text-[10px] text-nb-text-muted">{t('sessions.tabsCount', { count: s.tabs.length })} · {fmtDate(s.createdAt)}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                <button onClick={()=>onRestore(s.id)} className="px-1.5 py-0.5 rounded text-[10px] bg-brand-700 hover:bg-brand-600 text-white transition-colors">{t('common.restore')}</button>
                <button onClick={()=>onDelete(s.id)} className="p-1 rounded hover:bg-nb-raised text-nb-text-dim hover:text-red-600 dark:hover:text-red-400 transition-colors"><X size={10} /></button>
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const { t, i18n } = useTranslation()
  useTheme()

  // ── Tabs (managed entirely in React, no IPC for basic ops) ──────────────
  const [tabs, setTabs] = useState<TabState[]>([
    { id: INITIAL_TAB_ID, src: 'about:blank', url: '', title: '新标签页', isLoading: false, favicon: null },
  ])
  const [activeId, setActiveId] = useState<string>(INITIAL_TAB_ID)
  const activeIdRef = useRef<string>(INITIAL_TAB_ID)
  const webviewsRef = useRef<Map<string, WebviewElement>>(new Map())

  // ── UI state ─────────────────────────────────────────────────────────────
  const [urlInput, setUrlInput]         = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [chatOpen, setChatOpen]         = useState(true)
  const [chatWidth, setChatWidth]       = useState(420)  // 可调整的面板宽度
  const [isResizing, setIsResizing]     = useState(false)
  const [historyOpen, setHistoryOpen]   = useState(false)
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const [readingMode, setReadingMode]   = useState<{title:string;url:string;text:string}|null>(null)
  const [adBlockOn, setAdBlockOn]       = useState(true)

  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  const [history,   setHistory]   = useState<HistoryItem[]>([])
  const [sessions,  setSessions]  = useState<SessionItem[]>([])

  const urlInputRef = useRef<HTMLInputElement>(null)
  const chatSendRef = useRef<((text:string)=>void)|null>(null)

  const activeTab  = tabs.find(t => t.id === activeId) ?? null
  const currentUrl = activeTab?.url ?? ''
  const isBookmarked = bookmarks.some(b => b.url === currentUrl)

  // Keep activeIdRef in sync
  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  // Sync URL bar with active tab
  useEffect(() => {
    setUrlInput(activeTab?.url ?? '')
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notify main of active webview + sync tab state cache ─────────────────
  const notifyActiveWebview = useCallback((wv: WebviewElement) => {
    try {
      const id = wv.getWebContentsId()
      eAPI?.setActiveWebview(id)
    } catch (_) {}
  }, [])

  useEffect(() => {
    const wv = webviewsRef.current.get(activeId)
    if (wv) notifyActiveWebview(wv)
  }, [activeId, notifyActiveWebview])

  // Sync tab state to main process whenever it changes
  useEffect(() => {
    eAPI?.updateTabState({ tabs, activeId })
  }, [tabs, activeId])

  // ── Wire webview event listeners on first mount ───────────────────────────
  const wireWebview = useCallback((tabId: string, el: WebviewElement) => {
    if (webviewsRef.current.has(tabId)) return
    webviewsRef.current.set(tabId, el)

    el.addEventListener('did-start-loading', () =>
      setTabs(prev => prev.map(t => t.id===tabId ? {...t, isLoading:true} : t)))

    el.addEventListener('did-stop-loading', () => {
      const url = el.getURL()
      // Only update url (address bar), never src — changing src causes a new navigation
      setTabs(prev => prev.map(t => t.id===tabId ? {...t, isLoading:false, url} : t))
      if (tabId === activeIdRef.current) {
        setUrlInput(url)
        notifyActiveWebview(el)
        // Track history and refresh new-tab page data
        const title = el.getTitle()
        if (url && !url.startsWith('about:')) {
          addHistory(url, title, '').catch(() => {})
          listHistory(50).then(setHistory).catch(() => {})
        }
      }
    })

    el.addEventListener('page-title-updated', (e: any) =>
      setTabs(prev => prev.map(t => t.id===tabId ? {...t, title: e.title} : t)))

    el.addEventListener('page-favicon-updated', (e: any) => {
      if (e.favicons?.[0]) setTabs(prev => prev.map(t => t.id===tabId ? {...t, favicon: e.favicons[0]} : t))
    })

    el.addEventListener('did-navigate', (e: any) => {
      setTabs(prev => prev.map(t => t.id===tabId ? {...t, url: e.url} : t))
      if (tabId === activeIdRef.current) setUrlInput(e.url)
    })

    el.addEventListener('did-navigate-in-page', (e: any) => {
      setTabs(prev => prev.map(t => t.id===tabId ? {...t, url: e.url} : t))
      if (tabId === activeIdRef.current) setUrlInput(e.url)
    })

    el.addEventListener('new-window', (e: any) => createTab(e.url))

    el.addEventListener('context-menu', (e: any) => {
      eAPI?.showContextMenu({
        x: e.x, y: e.y,
        linkURL: e.params?.linkURL || '',
        linkText: e.params?.linkText || '',
        srcURL: e.params?.srcURL || '',
        mediaType: e.params?.mediaType || 'none',
        selectionText: e.params?.selectionText || '',
        isEditable: e.params?.isEditable || false,
      })
    })

    el.addEventListener('dom-ready', () => {
      if (tabId === activeIdRef.current) notifyActiveWebview(el)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifyActiveWebview])

  // ── Tab operations ────────────────────────────────────────────────────────
  const createTab = useCallback((url = '') => {
    const id = uuidv4()
    setTabs(prev => [...prev, { id, src: url || 'about:blank', url, title: '新标签页', isLoading: false, favicon: null }])
    setActiveId(id)
    return id
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== id)
      if (remaining.length === 0) {
        const newId = uuidv4()
        setActiveId(newId)
        return [{ id: newId, src: 'about:blank', url: '', title: '新标签页', isLoading: false, favicon: null }]
      }
      if (activeIdRef.current === id) setActiveId(remaining[remaining.length - 1].id)
      return remaining
    })
    webviewsRef.current.delete(id)
  }, [])

  const switchTab = useCallback((id: string) => {
    setActiveId(id)
    const wv = webviewsRef.current.get(id)
    if (wv) notifyActiveWebview(wv)
  }, [notifyActiveWebview])

  // ── Navigation ────────────────────────────────────────────────────────────
  const navigate = useCallback((raw: string) => {
    let url = raw.trim()
    if (!url) return
    if (!/^[a-z][a-z\d+\-.]*:\/\//i.test(url)) {
      if (url.includes('.') && !url.includes(' ')) url = 'https://' + url
      else url = `https://www.google.com/search?q=${encodeURIComponent(url)}`
    }
    setUrlInput(url)
    // Update tab state (url for address bar display)
    setTabs(prev => prev.map(t => t.id === activeIdRef.current ? { ...t, url } : t))
    // Use loadURL directly - don't update src as it would trigger a second navigation
    const wv = webviewsRef.current.get(activeIdRef.current)
    if (wv) {
      wv.loadURL(url).catch(() => {})
    } else {
      // If webview not ready yet, update src so it loads when mounted
      setTabs(prev => prev.map(t => t.id === activeIdRef.current ? { ...t, src: url } : t))
    }
  }, [])

  // ── Reorder tabs (drag-to-sort within tab bar) ───────────────────────────
  const reorderTab = useCallback((draggedId: string, targetId: string) => {
    setTabs(prev => {
      const from = prev.findIndex(t => t.id === draggedId)
      const to   = prev.findIndex(t => t.id === targetId)
      if (from === -1 || to === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  // ── Detach tab → new window ────────────────────────────────────────────────
  const detachTab = useCallback((tab: TabState, screenX: number, screenY: number) => {
    let theme = localStorage.getItem('urchin-theme') || 'dark'
    // 如果是 system，获取系统主题
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    eAPI?.detachTab(tab.url || '', screenX, screenY, theme)
    closeTab(tab.id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const goBack    = () => webviewsRef.current.get(activeIdRef.current)?.goBack()
  const goForward = () => webviewsRef.current.get(activeIdRef.current)?.goForward()
  const reloadTab = () => webviewsRef.current.get(activeIdRef.current)?.reload()

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') navigate(urlInput)
    if (e.key === 'Escape') { setUrlInput(activeTab?.url ?? ''); urlInputRef.current?.blur() }
  }

  // ── AI bridge commands (from Python agent) ────────────────────────────────
  useEffect(() => {
    if (!eAPI) return
    const off1 = eAPI.onCmdNewTab(url => createTab(url))
    const off2 = eAPI.onCmdCloseTab(() => closeTab(activeIdRef.current))
    const off3 = eAPI.onCmdSwitchTab(id => switchTab(id))
    const off4 = eAPI.onCmdRestoreSession(tabList => {
      setTabs([])
      webviewsRef.current.clear()
      tabList.forEach(t => createTab(t.url))
    })
    return () => { off1(); off2(); off3(); off4() }
  }, [createTab, closeTab, switchTab])

  // ── Open initialUrl from detached tab (new window created by drag) ──────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const initialUrl = params.get('initialUrl')
    if (initialUrl) navigate(initialUrl)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Load bookmarks + adblock state (on mount and when backend becomes ready) ─
  const loadInitialData = useCallback(() => {
    listBookmarks().then(setBookmarks).catch(() => {})
    listHistory(50).then(setHistory).catch(() => {})
    eAPI?.getAdBlockEnabled().then(setAdBlockOn).catch(() => {})
  }, [])

  useEffect(() => {
    loadInitialData()
    if (!eAPI?.onBackendReady) return
    const off = eAPI.onBackendReady(loadInitialData)
    return () => off?.()
  }, [loadInitialData])

  // ── Panels ────────────────────────────────────────────────────────────────
  const closeAllPanels = () => { setHistoryOpen(false); setBookmarksOpen(false); setSessionsOpen(false) }

  const openHistory  = () => { listHistory().then(setHistory).catch(()=>{}); closeAllPanels(); setHistoryOpen(true) }
  const closeHistory = () => setHistoryOpen(false)

  const openBookmarks  = () => { listBookmarks().then(setBookmarks).catch(()=>{}); closeAllPanels(); setBookmarksOpen(true) }
  const closeBookmarks = () => setBookmarksOpen(false)

  const openSessions  = () => { eAPI?.getAllSessions().then(setSessions).catch(()=>{}); closeAllPanels(); setSessionsOpen(true) }
  const closeSessions = () => setSessionsOpen(false)

  // ── Bookmark toggle ───────────────────────────────────────────────────────
  const toggleBookmark = async () => {
    if (!currentUrl || currentUrl === 'about:blank') return
    if (isBookmarked) {
      await removeBookmark(currentUrl).catch(() => {})
      setBookmarks(prev => prev.filter(b => b.url !== currentUrl))
    } else {
      const result = await addBookmark(currentUrl, activeTab?.title ?? '', activeTab?.favicon ?? '').catch(() => null)
      // Use category from backend response, or reload bookmarks to get the category
      if (result?.category) {
        setBookmarks(prev => [...prev, { url: currentUrl, title: activeTab?.title ?? '', favicon: activeTab?.favicon ?? '', category: result.category, createdAt: Date.now()/1000 }])
      } else {
        // Fallback: reload bookmarks to ensure consistency
        listBookmarks().then(setBookmarks).catch(() => {})
      }
    }
  }

  // ── Reading mode (no hide/show needed — webview is HTML, z-index works) ───
  const openReadingMode = async () => {
    try {
      setReadingMode(await getPageContent())
    } catch {
      setReadingMode({ title: '无法读取', url: currentUrl, text: '无法获取页面内容，请确认页面已加载完成。' })
    }
  }

  // ── Settings (same — just toggle, no hide/show needed) ───────────────────
  const openSettings  = () => { closeAllPanels(); setSettingsOpen(true) }
  const closeSettings = () => setSettingsOpen(false)

  // ── AI summarize ──────────────────────────────────────────────────────────
  const aiSummarize = async () => {
    if (!chatSendRef.current) return
    if (!chatOpen) { setChatOpen(true) }
    try {
      const content = await getPageContent()
      chatSendRef.current(`请总结以下网页内容：\n\n标题：${content.title}\nURL：${content.url}\n\n${content.text.slice(0, 8000)}`)
    } catch {
      chatSendRef.current('请总结当前浏览器中的页面内容（使用 browser_get_page_content 工具读取页面）')
    }
  }

  // ── Ad block ─────────────────────────────────────────────────────────────
  const toggleAdBlock = async () => {
    const next = !adBlockOn; setAdBlockOn(next); await eAPI?.setAdBlockEnabled(next)
  }

  // ── Sessions ─────────────────────────────────────────────────────────────
  const handleSaveSession = async (name: string) => {
    const saved = await eAPI?.saveSession(name)
    if (saved) setSessions(prev => [...prev, saved as SessionItem])
  }
  const handleRestoreSession = async (id: string) => { await eAPI?.restoreSession(id); closeSessions() }
  const handleDeleteSession  = async (id: string) => { await eAPI?.deleteSession(id); setSessions(prev => prev.filter(s => s.id !== id)) }

  const handleClearHistory = async () => { await clearHistory().catch(() => {}); setHistory([]) }
  const handleAgentNavigate = useCallback((url: string) => navigate(url), [navigate])

  // ── Chat panel resize ─────────────────────────────────────────────────────
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    const startX = e.clientX
    const startWidth = chatWidth

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX  // 向左拖拽增大宽度
      const newWidth = Math.min(600, Math.max(320, startWidth + delta))
      setChatWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [chatWidth])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-nb-deepest select-none">

      {/* ── Tab bar ──────────────────────────────────────────────────── */}
      <TabBar tabs={tabs} activeId={activeId} onSwitch={switchTab} onClose={closeTab} onNew={() => createTab()} onDetach={detachTab} onReorder={reorderTab} t={t} />

      {/* ── Navigation bar ───────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1.5 px-2 shrink-0 bg-nb-card border-b border-nb-border relative"
        style={{ height: NAV_BAR_HEIGHT, WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* Back / Forward / Reload */}
        <div className="flex items-center gap-0.5 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={goBack}    className="p-1.5 rounded text-nb-text-dim hover:text-nb-text-soft hover:bg-nb-raised transition-colors"><ChevronLeft  size={16} /></button>
          <button onClick={goForward} className="p-1.5 rounded text-nb-text-dim hover:text-nb-text-soft hover:bg-nb-raised transition-colors"><ChevronRight size={16} /></button>
          <button onClick={reloadTab} className="p-1.5 rounded text-nb-text-dim hover:text-nb-text-soft hover:bg-nb-raised transition-colors">
            {activeTab?.isLoading ? <X size={15} /> : <RefreshCw size={15} />}
          </button>
        </div>

        {/* URL bar */}
        <div className="flex items-center gap-1.5 bg-nb-raised hover:bg-nb-hover focus-within:bg-nb-hover rounded-full px-3 py-1.5 min-w-0 transition-colors"
          style={{ flex:1, WebkitAppRegion:'no-drag' } as React.CSSProperties}>
          <Globe size={13} className="text-nb-text-dim shrink-0" />
          <input ref={urlInputRef} value={urlInput} onChange={e=>setUrlInput(e.target.value)}
            onKeyDown={handleUrlKeyDown} onFocus={e=>e.target.select()}
            placeholder={t('common.searchOrUrl')}
            className="flex-1 bg-transparent text-sm text-nb-text placeholder:text-nb-text-muted outline-none min-w-0" />
          <button onClick={toggleBookmark} title={isBookmarked ? t('common.removeBookmark') : t('common.addBookmark')}
            className={`shrink-0 p-0.5 rounded transition-colors ${isBookmarked ? 'text-yellow-400 hover:text-yellow-300' : 'text-nb-text-muted hover:text-nb-text-soft'}`}>
            {isBookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
          </button>
        </div>

        {/* Reading mode + AI summarize */}
        <div className="flex items-center gap-0.5 shrink-0" style={{ WebkitAppRegion:'no-drag' } as React.CSSProperties}>
          <button onClick={openReadingMode} title={t('common.readingMode')}   className="p-1.5 rounded text-nb-text-dim hover:text-nb-text-soft hover:bg-nb-raised transition-colors"><BookOpen  size={15} /></button>
          <button onClick={aiSummarize}     title={t('common.aiSummarize')} className="p-1.5 rounded text-nb-text-dim hover:text-brand-400 hover:bg-nb-raised transition-colors"><Sparkles  size={15} /></button>
        </div>

        {/* Right panel: history / sessions / bookmarks / adblock / settings / chat toggle */}
        <div className="flex items-center gap-1 shrink-0" style={{ WebkitAppRegion:'no-drag' } as React.CSSProperties}>
          <div className="flex-1" />

          {/* History */}
          <div className="relative">
            <button onClick={historyOpen ? closeHistory : openHistory} title="浏览历史"
              className={`p-1.5 rounded transition-colors ${historyOpen ? 'text-brand-400 bg-nb-raised' : 'text-nb-text-dim hover:text-nb-text-soft hover:bg-nb-raised'}`}>
              <Clock size={15} />
            </button>
            {historyOpen && <HistoryPanel items={history} onNavigate={navigate} onClear={handleClearHistory} onClose={closeHistory} t={t} />}
          </div>

          {/* Sessions */}
          <div className="relative">
            <button onClick={sessionsOpen ? closeSessions : openSessions} title="会话管理"
              className={`p-1.5 rounded transition-colors ${sessionsOpen ? 'text-brand-400 bg-nb-raised' : 'text-nb-text-dim hover:text-nb-text-soft hover:bg-nb-raised'}`}>
              <FolderOpen size={15} />
            </button>
            {sessionsOpen && <SessionsPanel sessions={sessions} onSave={handleSaveSession} onRestore={handleRestoreSession} onDelete={handleDeleteSession} onClose={closeSessions} t={t} />}
          </div>

          {/* Bookmarks */}
          <div className="relative">
            <button onClick={bookmarksOpen ? closeBookmarks : openBookmarks} title="书签"
              className={`p-1.5 rounded transition-colors ${bookmarksOpen ? 'text-brand-400 bg-nb-raised' : 'text-nb-text-dim hover:text-nb-text-soft hover:bg-nb-raised'}`}>
              <Bookmark size={15} />
            </button>
            {bookmarksOpen && <BookmarksPanel items={bookmarks} t={t} i18n={i18n} onNavigate={navigate}
              onRemove={url => { removeBookmark(url).catch(()=>{}); setBookmarks(prev=>prev.filter(b=>b.url!==url)) }}
              onCategoryChange={(url, cat) => { updateBookmarkCategory(url, cat).catch(()=>{}); setBookmarks(prev=>prev.map(b=>b.url===url?{...b,category:cat}:b)) }}
              onClose={closeBookmarks} />}
          </div>

          {/* Ad block */}
          <button onClick={toggleAdBlock} title={adBlockOn ? t('common.adBlockOn') : t('common.adBlockOff')}
            className={`p-1.5 rounded transition-colors ${adBlockOn ? 'text-green-600 dark:text-green-400 hover:bg-nb-raised' : 'text-nb-text-muted hover:text-nb-text-soft hover:bg-nb-raised'}`}>
            {adBlockOn ? <Shield size={15} /> : <ShieldOff size={15} />}
          </button>

          {chatOpen && (
            <button onClick={openSettings} title={t('common.settings')}
              className="p-1.5 rounded text-nb-text-dim hover:text-nb-text-soft hover:bg-nb-raised transition-colors">
              <Settings size={16} />
            </button>
          )}
          <button onClick={() => setChatOpen(p => !p)} title={chatOpen ? t('common.collapseChat') : t('common.expandChat')}
            className="p-1.5 rounded text-nb-text-dim hover:text-nb-text-soft hover:bg-nb-raised transition-colors">
            {chatOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        </div>
      </div>

      {/* ── Content row ──────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Browser area — webview elements live here (normal HTML, z-index works) */}
        <div className="flex-1 relative bg-nb-deepest overflow-hidden">

          {/* All tab webviews — visibility toggled via CSS (keeps them alive).
              Blank/new tabs have pointer-events disabled so NewTabPage below
              can receive clicks. */}
          {tabs.map(tab => {
            const isActive  = tab.id === activeId
            const isBlank   = !tab.url || tab.url === 'about:blank'
            return (
              <webview
                key={tab.id}
                ref={(el: any) => { if (el) wireWebview(tab.id, el as WebviewElement) }}
                src={tab.src}
                partition="persist:urchin"
                allowpopups="true"
                style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  visibility: isActive && !isBlank ? 'visible' : 'hidden',
                  pointerEvents: isActive && !isBlank ? 'auto' : 'none',
                }}
              />
            )
          })}

          {/* New-tab page — rendered AFTER webviews so it sits on top in z-order.
              Only shown when the active tab has no real URL yet. */}
          {(!activeTab?.url || activeTab.url === 'about:blank') && (
            <div className="absolute inset-0 z-10">
              <NewTabPage
                onNavigate={navigate}
                bookmarks={bookmarks}
                history={history}
              />
            </div>
          )}
        </div>

        {/* Chat panel — right side */}
        <div
          className={`relative flex flex-col border-l border-nb-border bg-nb-base shrink-0 overflow-hidden ${isResizing ? '' : 'transition-all duration-200 ease-in-out'}`}
          style={{ width: chatOpen ? chatWidth : 0 }}
        >
          {/* Resize handle */}
          {chatOpen && (
            <div
              onMouseDown={handleResizeStart}
              className={`absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize group z-10 ${
                isResizing ? 'bg-brand-500' : 'hover:bg-brand-500/50'
              }`}
              style={{ marginLeft: -4 }}
            />
          )}
          <ChatPanel sessionId={SESSION_ID} onAgentNavigate={handleAgentNavigate} sendRef={chatSendRef} onOpenSettings={openSettings} />
        </div>
      </div>

      {/* ── Overlays (z-50, naturally above webview) ─────────────────── */}
      {/* No hideBrowser/showBrowser needed — webview is an HTML element */}
      <SettingsModal open={settingsOpen} onClose={closeSettings} />
      <ReadingModeOverlay content={readingMode} onClose={() => setReadingMode(null)} />
    </div>
  )
}
