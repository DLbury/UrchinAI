import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Settings, RefreshCw, ChevronLeft, ChevronRight, Globe,
  Plus, X, Loader2, PanelRightClose, PanelRightOpen,
  Bookmark, BookmarkCheck, Clock, Trash2, Search, History,
  Shield, ShieldOff, Minus, Maximize2,
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
  listChatSessions, saveChatSessions,
} from './api/client'

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
  newSession:          ()             => Promise<{ ok: boolean }>
  onCmdNewSession:     (cb: () => void) => () => void
  openExternal:        (url: string)  => Promise<void>
  onBackendReady:      (cb: () => void) => () => void
  getFXEnabled:        () => Promise<boolean>
  setFXEnabled:        (enabled: boolean) => Promise<void>
  // Cookies
  getCookies:          (domain?: string) => Promise<CookieItem[]>
  setCookie:          (opts: SetCookieOpts) => Promise<{ ok: boolean; error?: string }>
  removeCookie:       (opts: { url: string; name: string }) => Promise<{ ok: boolean; error?: string }>
  clearAllCookies:     () => Promise<{ ok: boolean; error?: string }>
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
interface ChatSession  { id: string; name: string; createdAt: number; messages: Array<{ id: string; role: string; content: string; toolCalls?: unknown[]; files?: unknown[]; createdAt: number }> }
interface CookieItem   { name: string; value: string; domain: string; path: string; secure: boolean; httpOnly: boolean; sameSite: string; expirationDate?: number }
interface SetCookieOpts { url: string; name: string; value: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean; sameSite?: string; expirationDate?: number }

const INITIAL_TAB_ID = uuidv4()

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
      {/* Tabs container - no-drag to allow tab interaction */}
      <div className="flex items-end gap-0 px-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
              className={`group relative flex items-center gap-1.5 px-3 min-w-[120px] max-w-[200px] h-[34px]
                rounded-t-lg cursor-grab active:cursor-grabbing select-none shrink-0 transition-all duration-150
                ${isActive ? 'bg-nb-card text-nb-text shadow-sm' : 'bg-nb-deepest text-nb-text-dim hover:bg-nb-card/80 hover:text-nb-text-soft'}
                ${isDropTarget ? 'ring-2 ring-brand-500/80 ring-inset shadow-lg shadow-brand-500/20' : ''}
                ${isDraggingOut && dragTabRef.current?.id === tab.id ? 'opacity-40 scale-95' : ''}`}
            >
              <span className="w-4 h-4 shrink-0 flex items-center justify-center">
                {tab.isLoading ? <Loader2 size={12} className="animate-spin text-brand-400" />
                  : tab.favicon ? <img src={tab.favicon} className="w-4 h-4 object-contain" alt="" />
                  : <Globe size={12} className="opacity-50" />}
              </span>
              <span className="flex-1 text-xs truncate font-medium">{tab.title || tab.url || t('common.newTab')}</span>
              <button onClick={e => { e.stopPropagation(); onClose(tab.id) }}
                className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center transition-all duration-150
                  ${isActive ? 'opacity-0 group-hover:opacity-100 group-hover:bg-nb-hover/80 hover:bg-nb-hover hover:text-nb-text' : 'opacity-0 group-hover:opacity-100 group-hover:bg-nb-hover/60 hover:bg-nb-hover hover:text-nb-text'}`}>
                <X size={11} />
              </button>
              {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-brand-500 to-brand-400 rounded-full" />}
            </div>
          )
        })}
        <button onClick={onNew}
          className="shrink-0 w-8 h-8 mb-0.5 ml-1 flex items-center justify-center rounded-lg text-nb-text-muted hover:text-nb-text hover:bg-nb-card/60 transition-all duration-150 hover:scale-105 active:scale-95">
          <Plus size={15} />
        </button>
      </div>
      {/* Spacer - drag area */}
      <div className="flex-1 min-w-[40px]" />
      {/* Window controls */}
      <div className="flex items-center h-full shrink-0 mr-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => (window as any).electronAPI?.windowMinimize()}
          className="w-10 h-8 flex items-center justify-center hover:bg-nb-card/80 rounded-lg transition-all duration-150 group"
          title="最小化"
        >
          <Minus size={14} className="text-nb-text-dim group-hover:text-nb-text transition-colors" />
        </button>
        <button
          onClick={() => (window as any).electronAPI?.windowMaximize()}
          className="w-10 h-8 flex items-center justify-center hover:bg-nb-card/80 rounded-lg transition-all duration-150 group"
          title="最大化"
        >
          <Maximize2 size={12} className="text-nb-text-dim group-hover:text-nb-text transition-colors" />
        </button>
        <button
          onClick={() => (window as any).electronAPI?.windowClose()}
          className="w-10 h-8 flex items-center justify-center hover:bg-red-500/90 rounded-lg transition-all duration-150 group"
          title="关闭"
        >
          <X size={14} className="text-nb-text-dim group-hover:text-white transition-colors" />
        </button>
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
    <div className="absolute right-0 top-full mt-2 w-96 max-h-[70vh] bg-nb-base border border-nb-border rounded-2xl shadow-2xl shadow-black/20 z-40 flex flex-col overflow-hidden backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-nb-border/60 shrink-0 bg-gradient-to-r from-nb-card/50 to-transparent">
        <span className="text-sm font-semibold text-nb-text flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
            <Clock size={14} className="text-amber-500" />
          </div>
          {t('history.title')}
        </span>
        <div className="flex items-center gap-1.5">
          <button onClick={onClear} title={t('history.clearAll')} className="p-1.5 rounded-lg hover:bg-nb-raised text-nb-text-dim hover:text-red-500 transition-all duration-150"><Trash2 size={13} /></button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-nb-raised text-nb-text-dim hover:text-nb-text-soft transition-all duration-150"><X size={13} /></button>
        </div>
      </div>
      <div className="px-3 py-2.5 border-b border-nb-border/60 shrink-0">
        <div className="flex items-center gap-2.5 bg-nb-card/80 rounded-xl px-3 py-2 border border-nb-border/50 focus-within:border-brand-500/50 focus-within:bg-nb-card transition-all">
          <Search size={13} className="text-nb-text-muted shrink-0" />
          <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('history.searchPlaceholder')}
            className="flex-1 bg-transparent text-xs text-nb-text-soft placeholder:text-nb-text-muted outline-none" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filtered.length===0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-nb-text-muted">
            <div className="w-16 h-16 rounded-2xl bg-nb-card/50 flex items-center justify-center mb-3">
              <Clock size={28} className="opacity-30" />
            </div>
            <p className="text-sm font-medium text-nb-text-soft">{t('history.empty')}</p>
          </div>
        ) : filtered.map((h,i)=>(
          <button key={i} onClick={()=>{onNavigate(h.url);onClose()}}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-nb-card/80 transition-all duration-150 text-left group border-b border-nb-border/30 last:border-b-0">
              <div className="w-8 h-8 rounded-lg bg-nb-card/50 flex items-center justify-center shrink-0 group-hover:bg-brand-500/10 transition-colors">
                {h.favicon ? <img src={h.favicon} className="w-4 h-4 shrink-0 object-contain" alt="" /> : <Globe size={14} className="text-nb-text-muted" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-nb-text-soft truncate group-hover:text-nb-text font-medium transition-colors">{h.title||h.url}</p>
                <p className="text-[10px] text-nb-text-muted truncate mt-0.5">{h.url}</p>
              </div>
              <span className="shrink-0 text-[10px] text-nb-text-muted/70 bg-nb-card/50 px-1.5 py-0.5 rounded">{fmtTime(h.visitedAt)}</span>
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
    <div className="absolute right-0 top-full mt-2 w-96 max-h-[70vh] bg-nb-base border border-nb-border rounded-2xl shadow-2xl shadow-black/20 z-40 flex flex-col overflow-hidden backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-nb-border/60 shrink-0 bg-gradient-to-r from-nb-card/50 to-transparent">
        <span className="text-sm font-semibold text-nb-text flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
            <Bookmark size={14} className="text-emerald-500" />
          </div>
          {t('bookmarks.title')}
        </span>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-nb-raised text-nb-text-dim hover:text-nb-text-soft transition-all duration-150">
          <X size={13} />
        </button>
      </div>

      {/* Category filter */}
      <div className="px-3 py-2.5 border-b border-nb-border/60 shrink-0 overflow-x-auto scrollbar-thin">
        <div className="flex gap-1.5 flex-nowrap">
          <button
            onClick={() => setFilter('all')}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
              filter === 'all' ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-sm shadow-brand-500/20' : 'bg-nb-card text-nb-text-dim hover:text-nb-text hover:bg-nb-card/80 border border-nb-border/50'
            }`}
          >
            全部 ({items.length})
          </button>
          {Object.entries(groupedItems).map(([catId, catItems]) => {
            const catInfo = getCategoryInfo(catId)
            return (
              <button
                key={catId}
                onClick={() => setFilter(catId)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                  filter === catId ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-sm shadow-brand-500/20' : 'bg-nb-card text-nb-text-dim hover:text-nb-text hover:bg-nb-card/80 border border-nb-border/50'
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
          <div className="flex flex-col items-center justify-center py-12 text-nb-text-muted">
            <div className="w-16 h-16 rounded-2xl bg-nb-card/50 flex items-center justify-center mb-3">
              <Bookmark size={28} className="opacity-30" />
            </div>
            <p className="text-sm font-medium text-nb-text-soft">{t('bookmarks.empty')}</p>
          </div>
        ) : filter === 'all' ? (
          // Show grouped by category
          Object.entries(groupedItems).map(([catId, catItems]) => {
            const catInfo = getCategoryInfo(catId)
            return (
              <div key={catId}>
                <div className="px-4 py-2 bg-gradient-to-r from-nb-raised/50 to-transparent text-xs font-semibold text-nb-text-dim sticky top-0 backdrop-blur-sm border-b border-nb-border/30">
                  <span className="mr-1.5">{catInfo?.icon || '📌'}</span>
                  {getCategoryName(catId)}
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
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const catBtnRef = useRef<HTMLButtonElement>(null)

  const openDropdown = () => {
    if (catBtnRef.current) {
      const rect = catBtnRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 4, left: rect.right - 144 })
    }
    setShowCatSelect(true)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showCatSelect) return
    const handleClick = (e: MouseEvent) => {
      if (catBtnRef.current && !catBtnRef.current.contains(e.target as Node)) {
        setShowCatSelect(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showCatSelect])

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-nb-card/60 transition-all duration-150 group border-b border-nb-border/30 last:border-b-0">
      <div className="w-8 h-8 rounded-lg bg-nb-card/50 flex items-center justify-center shrink-0 group-hover:bg-brand-500/10 transition-colors">
        {bm.favicon ? (
          <img src={bm.favicon} className="w-4 h-4 shrink-0 object-contain" alt="" />
        ) : (
          <Globe size={14} className="text-nb-text-muted" />
        )}
      </div>
      <button onClick={() => { onNavigate(bm.url); onClose() }} className="flex-1 min-w-0 text-left">
        <p className="text-xs text-nb-text-soft truncate group-hover:text-nb-text font-medium transition-colors">{bm.title || bm.url}</p>
        <p className="text-[10px] text-nb-text-muted/70 truncate mt-0.5">{bm.url}</p>
      </button>

      {/* Category selector */}
      <div className="shrink-0">
        <button
          ref={catBtnRef}
          onClick={() => showCatSelect ? setShowCatSelect(false) : openDropdown()}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] bg-nb-card/80 border border-nb-border/50 text-nb-text-dim hover:text-nb-text hover:bg-nb-card hover:border-brand-500/30 transition-all duration-150"
          title="Change category"
        >
          {categories.find(c => c.id === bm.category)?.icon || '📌'}
        </button>
        {showCatSelect && createPortal(
          <div
            className="fixed bg-nb-base border border-nb-border rounded-xl shadow-2xl shadow-black/20 z-[9999] py-1.5 max-h-48 overflow-y-auto backdrop-blur-xl"
            style={{ top: dropdownPos.top, left: dropdownPos.left, width: 144 }}
          >
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => { onCategoryChange(bm.url, cat.id); setShowCatSelect(false) }}
                className={`w-full px-3 py-2 text-left text-xs hover:bg-nb-card transition-colors flex items-center gap-2 ${
                  bm.category === cat.id ? 'text-brand-500 font-medium bg-brand-500/10' : 'text-nb-text-soft'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{i18n.language === 'zh-CN' ? cat.name : (cat.name_en || cat.name)}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
      </div>

      <button
        onClick={() => onRemove(bm.url)}
        className="shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-nb-text-dim hover:text-red-500 transition-all duration-150"
      >
        <X size={11} />
      </button>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const { t, i18n } = useTranslation()
  const { effectiveTheme } = useTheme()

  // Ref to hold theme for webview background color
  const webviewThemeRef = useRef<string>('light')

  // Update webview theme ref when theme changes
  useEffect(() => {
    webviewThemeRef.current = effectiveTheme
  }, [effectiveTheme])

  // Update background color and force prefers-color-scheme of all existing webviews
  useEffect(() => {
    const bgColor = effectiveTheme === 'dark' ? '#111827' : '#ffffff'
    console.log('[Theme] Setting theme to:', effectiveTheme)

    webviewsRef.current.forEach((wv) => {
      try {
        wv.setBackgroundColor?.(bgColor)
        console.log('[Theme] setBackgroundColor called on webview')
      } catch (e) {
        console.error('[Theme] Error:', e)
      }
    })
  }, [effectiveTheme])

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
  const [savedSessions, setSavedSessions] = useState<SessionItem[]>([])
  const [sessionDropdownOpen, setSessionDropdownOpen] = useState(false)
  const sessionDropRef = useRef<HTMLDivElement>(null)
  const [isResizing, setIsResizing]     = useState(false)
  const [historyOpen, setHistoryOpen]   = useState(false)
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [adBlockOn, setAdBlockOn]       = useState(true)

  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  const [history,   setHistory]   = useState<HistoryItem[]>([])
  
  // ── Chat Sessions (AI conversation management) ──────────────────────────────
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [currentChatSessionId, setCurrentChatSessionId] = useState<string>('')
  const chatInitRef = useRef(false)

  // Load chat sessions from backend
  const loadChatSessions = useCallback(() => {
    listChatSessions().then(data => {
      if (data.sessions.length > 0) {
        setChatSessions(data.sessions)
        setCurrentChatSessionId(data.currentSessionId || data.sessions[0].id)
      } else {
        const defaultSession = { id: uuidv4(), name: '默认会话', createdAt: Date.now(), messages: [] }
        setChatSessions([defaultSession])
        setCurrentChatSessionId(defaultSession.id)
      }
    }).catch(() => {
      // Backend not ready or no data
    })
  }, [])

  useEffect(() => {
    if (chatInitRef.current) return
    chatInitRef.current = true
    loadChatSessions()
  }, [loadChatSessions])

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

    el.addEventListener('did-start-loading', () => {
      // Set background color BEFORE page loads to affect prefers-color-scheme
      const isDark = webviewThemeRef.current === 'dark'
      const bgColor = isDark ? '#111827' : '#ffffff'
      try {
        el.setBackgroundColor?.(bgColor)
      } catch (e) {
        // Ignore
      }
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
    const off5 = eAPI.onCmdNewSession(() => {
      setTabs([{ id: INITIAL_TAB_ID, src: 'about:blank', url: '', title: '新标签页', isLoading: false, favicon: null }])
      setActiveId(INITIAL_TAB_ID)
    })
    return () => { off1(); off2(); off3(); off4(); off5() }
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
  const closeAllPanels = () => { setHistoryOpen(false); setBookmarksOpen(false) }

  const openHistory  = () => { listHistory().then(setHistory).catch(()=>{}); closeAllPanels(); setHistoryOpen(true) }
  const closeHistory = () => setHistoryOpen(false)

  const openBookmarks  = () => { listBookmarks().then(setBookmarks).catch(()=>{}); closeAllPanels(); setBookmarksOpen(true) }
  const closeBookmarks = () => setBookmarksOpen(false)

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
  // ── Settings (same — just toggle, no hide/show needed) ───────────────────
  const openSettings  = () => { closeAllPanels(); setSettingsOpen(true) }
  const closeSettings = () => setSettingsOpen(false)

  // ── Session management ─────────────────────────────────────────────────────
  const loadSavedSessions = async () => {
    if (!eAPI?.getAllSessions) return
    const sessions = await eAPI.getAllSessions()
    setSavedSessions(sessions)
  }
  const handleSaveSession = async () => {
    if (!eAPI?.saveSession) return
    await eAPI.saveSession(`会话 ${new Date().toLocaleString('zh-CN')}`)
    await loadSavedSessions()
    setSessionDropdownOpen(false)
  }
  const handleRestoreSession = async (id: string) => {
    if (!eAPI?.restoreSession) return
    await eAPI.restoreSession(id)
    setSessionDropdownOpen(false)
  }
  const handleDeleteSession = async (id: string) => {
    if (!eAPI?.deleteSession) return
    await eAPI.deleteSession(id)
    await loadSavedSessions()
  }

  // Close session dropdown when clicking outside
  useEffect(() => {
    if (!sessionDropdownOpen) return
    const handleClick = (e: MouseEvent) => {
      if (sessionDropRef.current && !sessionDropRef.current.contains(e.target as Node)) {
        setSessionDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [sessionDropdownOpen])

  // ── Ad block ─────────────────────────────────────────────────────────────
  const toggleAdBlock = async () => {
    const next = !adBlockOn; setAdBlockOn(next); await eAPI?.setAdBlockEnabled(next)
  }

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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-nb-deepest select-none rounded-2xl">

      {/* ── Tab bar ──────────────────────────────────────────────────── */}
      <TabBar tabs={tabs} activeId={activeId} onSwitch={switchTab} onClose={closeTab} onNew={() => createTab()} onDetach={detachTab} onReorder={reorderTab} t={t} />

      {/* ── Navigation bar ───────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-2 shrink-0 bg-nb-card/80 backdrop-blur-md border-b border-nb-border/50 relative z-50"
        style={{ height: NAV_BAR_HEIGHT }}
      >
        {/* Back / Forward / Reload */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={goBack}    className="p-2 rounded-xl text-nb-text-dim hover:text-nb-text hover:bg-nb-raised/80 transition-all duration-150 active:scale-95"><ChevronLeft  size={16} /></button>
          <button onClick={goForward} className="p-2 rounded-xl text-nb-text-dim hover:text-nb-text hover:bg-nb-raised/80 transition-all duration-150 active:scale-95"><ChevronRight size={16} /></button>
          <button onClick={reloadTab} className="p-2 rounded-xl text-nb-text-dim hover:text-nb-text hover:bg-nb-raised/80 transition-all duration-150 active:scale-95">
            {activeTab?.isLoading ? <X size={15} /> : <RefreshCw size={15} />}
          </button>
        </div>

        {/* URL bar */}
        <div className="flex items-center gap-2 bg-nb-deepest/40 hover:bg-nb-deepest/60 focus-within:bg-nb-deepest/60 focus-within:ring-2 focus-within:ring-brand-500/40 rounded-2xl px-4 py-2 min-w-0 transition-all duration-150 flex-1 border border-nb-border/70 focus-within:border-brand-500/50">
          <Globe size={14} className="text-nb-text-dim shrink-0" />
          <input ref={urlInputRef} value={urlInput} onChange={e=>setUrlInput(e.target.value)}
            onKeyDown={handleUrlKeyDown} onFocus={e=>e.target.select()}
            placeholder={t('common.searchOrUrl')}
            className="flex-1 bg-transparent text-sm text-nb-text placeholder:text-nb-text-muted outline-none min-w-0" />
          <button onClick={toggleBookmark} title={isBookmarked ? t('common.removeBookmark') : t('common.addBookmark')}
            className={`shrink-0 p-1 rounded-lg transition-all duration-150 ${isBookmarked ? 'text-yellow-500 hover:text-yellow-400' : 'text-nb-text-dim hover:text-yellow-500 hover:bg-yellow-500/10'}`}>
            {isBookmarked ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
          </button>
        </div>

        {/* Right panel: history / bookmarks / adblock / settings / chat toggle */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Sessions */}
          <div className="relative" ref={sessionDropRef}>
            <button
              onClick={() => { loadSavedSessions(); setSessionDropdownOpen(o => !o) }}
              title="会话"
              className={`p-2 rounded-xl transition-all duration-150 ${sessionDropdownOpen ? 'text-brand-500 bg-brand-500/10' : 'text-nb-text-dim hover:text-brand-500 hover:bg-brand-500/10'}`}
            >
              <History size={15} />
            </button>
            {sessionDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-nb-base border border-nb-border rounded-xl shadow-2xl z-[100] overflow-hidden">
                <div className="p-2 border-b border-nb-border">
                  <button
                    onClick={handleSaveSession}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-nb-text hover:bg-nb-card transition-colors text-left"
                  >
                    <Plus size={14} className="text-brand-500" />
                    保存当前会话
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto scrollbar-thin">
                  {savedSessions.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-nb-text-dim">
                      暂无保存的会话
                    </div>
                  ) : (
                    savedSessions.map(s => (
                      <div key={s.id} className="group flex items-center gap-2 px-2 py-2 hover:bg-nb-card/60 transition-colors">
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleRestoreSession(s.id)}>
                          <div className="text-sm text-nb-text truncate">{s.name}</div>
                          <div className="text-xs text-nb-text-muted">
                            {s.tabs.length} 个标签页 · {new Date(s.createdAt).toLocaleDateString('zh-CN')}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id) }}
                          className="shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/15 text-red-400/60 hover:text-red-400 transition-all"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* History */}
          <div className="relative">
            <button onClick={historyOpen ? closeHistory : openHistory} title="浏览历史"
              className={`p-2 rounded-xl transition-all duration-150 ${historyOpen ? 'text-amber-500 bg-amber-500/10' : 'text-nb-text-dim hover:text-amber-500 hover:bg-amber-500/10'}`}>
              <Clock size={15} />
            </button>
            {historyOpen && <HistoryPanel items={history} onNavigate={navigate} onClear={handleClearHistory} onClose={closeHistory} t={t} />}
          </div>

          {/* Bookmarks */}
          <div className="relative">
            <button onClick={bookmarksOpen ? closeBookmarks : openBookmarks} title="书签"
              className={`p-2 rounded-xl transition-all duration-150 ${bookmarksOpen ? 'text-emerald-500 bg-emerald-500/10' : 'text-nb-text-dim hover:text-emerald-500 hover:bg-emerald-500/10'}`}>
              <Bookmark size={15} />
            </button>
            {bookmarksOpen && <BookmarksPanel items={bookmarks} t={t} i18n={i18n} onNavigate={navigate}
              onRemove={url => { removeBookmark(url).catch(()=>{}); setBookmarks(prev=>prev.filter(b=>b.url!==url)) }}
              onCategoryChange={(url, cat) => { updateBookmarkCategory(url, cat).catch(()=>{}); setBookmarks(prev=>prev.map(b=>b.url===url?{...b,category:cat}:b)) }}
              onClose={closeBookmarks} />}
          </div>

          {/* Ad block */}
          <button onClick={toggleAdBlock} title={adBlockOn ? t('common.adBlockOn') : t('common.adBlockOff')}
            className={`p-2 rounded-xl transition-all duration-150 ${adBlockOn ? 'text-green-500 bg-green-500/10 hover:bg-green-500/20' : 'text-nb-text-muted hover:text-green-500 hover:bg-green-500/10'}`}>
            {adBlockOn ? <Shield size={15} /> : <ShieldOff size={15} />}
          </button>

          {chatOpen && (
            <button onClick={openSettings} title={t('common.settings')}
              className="p-2 rounded-xl text-nb-text-dim hover:text-nb-text hover:bg-nb-raised/80 transition-all duration-150 active:scale-95">
              <Settings size={16} />
            </button>
          )}
          <button onClick={() => setChatOpen(p => !p)} title={chatOpen ? t('common.collapseChat') : t('common.expandChat')}
            className="p-2 rounded-xl text-nb-text-dim hover:text-nb-text hover:bg-nb-raised/80 transition-all duration-150 active:scale-95">
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
                  borderRadius: '0px',
                  overflow: 'hidden',
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
          {/* Resize handle - left edge of chat panel */}
          {chatOpen && (
            <div
              onMouseDown={handleResizeStart}
              className={`absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize group z-10 flex items-center justify-center ${
                isResizing ? 'bg-brand-500' : 'hover:bg-brand-500/50'
              }`}
              style={{ marginLeft: -2 }}
            >
              {/* Grip dots */}
              <div className="w-0.5 h-4 rounded-full bg-nb-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          )}
          <ChatPanel
            sessionId={currentChatSessionId}
            sessions={chatSessions}
            currentSessionId={currentChatSessionId}
            onSwitchSession={setCurrentChatSessionId}
            onNewSession={() => {
              const newSession = { id: uuidv4(), name: `会话 ${chatSessions.length + 1}`, createdAt: Date.now(), messages: [] }
              setChatSessions(prev => {
                const updated = [...prev, newSession]
                saveChatSessions(updated, newSession.id).catch(() => {})
                return updated
              })
              setCurrentChatSessionId(newSession.id)
            }}
            onRenameSession={(id, name) => {
              setChatSessions(prev => {
                const updated = prev.map(s => s.id === id ? { ...s, name } : s)
                saveChatSessions(updated, currentChatSessionId).catch(() => {})
                return updated
              })
            }}
            onDeleteSession={(id) => {
              setChatSessions(prev => {
                const filtered = prev.filter(s => s.id !== id)
                if (filtered.length === 0) {
                  const newSession = { id: uuidv4(), name: '默认会话', createdAt: Date.now(), messages: [] }
                  setCurrentChatSessionId(newSession.id)
                  saveChatSessions([newSession], newSession.id).catch(() => {})
                  return [newSession]
                }
                const newCurrentId = currentChatSessionId === id ? filtered[0].id : currentChatSessionId
                if (currentChatSessionId === id) {
                  setCurrentChatSessionId(filtered[0].id)
                }
                saveChatSessions(filtered, newCurrentId).catch(() => {})
                return filtered
              })
            }}
            onAgentNavigate={handleAgentNavigate}
            sendRef={chatSendRef}
            onOpenSettings={openSettings}
          />
        </div>
      </div>

      {/* ── Overlays (z-50, naturally above webview) ─────────────────── */}
      {/* No hideBrowser/showBrowser needed — webview is an HTML element */}
      <SettingsModal open={settingsOpen} onClose={closeSettings} />
    </div>
  )
}
