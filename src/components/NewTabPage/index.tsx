import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Clock, Globe, X } from 'lucide-react'

// ── Auto-categorization ───────────────────────────────────────────────────────

const CATEGORY_RULES: { name: string; icon: string; pattern: RegExp }[] = [
  { name: '搜索引擎', icon: '🔍', pattern: /google|baidu|bing|duckduckgo|sogou|yahoo|brave/ },
  { name: '视频娱乐', icon: '🎬', pattern: /youtube|bilibili|netflix|iqiyi|youku|vimeo|twitch|douyin/ },
  { name: '社交媒体', icon: '💬', pattern: /twitter|x\.com|facebook|instagram|weibo|linkedin|tiktok|discord/ },
  { name: '购物',     icon: '🛒', pattern: /amazon|taobao|jd\.com|tmall|pinduoduo|ebay|aliexpress|shopify/ },
  { name: '开发工具', icon: '💻', pattern: /github|gitlab|stackoverflow|npmjs|pypi|vercel|railway|cloudflare|docker/ },
  { name: '新闻资讯', icon: '📰', pattern: /news|bbc|cnn|xinhua|sina\.com|sohu|people\.com|reuters|theguardian/ },
  { name: 'AI 工具',  icon: '🤖', pattern: /openai|chatgpt|claude|gemini|deepseek|huggingface|cohere|midjourney/ },
  { name: '金融理财', icon: '💰', pattern: /bank|alipay|paypal|finance|trading|invest|stock|fund|crypto/ },
]

function categorize(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase()
    for (const rule of CATEGORY_RULES) {
      if (rule.pattern.test(host)) return rule.name
    }
  } catch (_) {}
  return '其他'
}

// ── Default quick links ───────────────────────────────────────────────────────

const DEFAULT_LINKS = [
  { title: 'Google',    url: 'https://google.com',       emoji: '🔍' },
  { title: 'GitHub',    url: 'https://github.com',       emoji: '💻' },
  { title: 'YouTube',   url: 'https://youtube.com',      emoji: '🎬' },
  { title: 'Bilibili',  url: 'https://bilibili.com',     emoji: '🎬' },
  { title: 'X',         url: 'https://x.com',            emoji: '💬' },
  { title: 'ChatGPT',   url: 'https://chatgpt.com',      emoji: '🤖' },
  { title: '百度',       url: 'https://baidu.com',        emoji: '🔍' },
  { title: 'Wikipedia', url: 'https://wikipedia.org',    emoji: '📖' },
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface BookmarkItem { url: string; title: string; favicon: string; createdAt: number }
interface HistoryItem  { url: string; title: string; favicon: string; visitedAt: number }

interface Props {
  onNavigate:  (url: string) => void
  bookmarks:   BookmarkItem[]
  history:     HistoryItem[]
}

// ── Helper: favicon with fallback ─────────────────────────────────────────────

function SiteFavicon({ url, favicon, emoji }: { url: string; favicon?: string; emoji?: string }) {
  const [err, setErr] = useState(false)
  if (favicon && !err) {
    return <img src={favicon} onError={() => setErr(true)} className="w-7 h-7 object-contain" alt="" />
  }
  if (emoji) return <span className="text-2xl leading-none">{emoji}</span>
  try {
    const host = new URL(url).hostname
    const gFavicon = `https://www.google.com/s2/favicons?domain=${host}&sz=64`
    return <img src={gFavicon} onError={() => setErr(true)} className="w-7 h-7 object-contain" alt="" />
  } catch (_) {
    return <Globe size={24} className="text-nb-text-muted" />
  }
}

// ── Clock ─────────────────────────────────────────────────────────────────────

function LiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const hm  = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const sec = now.toLocaleTimeString('zh-CN', { second: '2-digit' }).replace(/.*:/, '')
  const date = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div className="flex items-end gap-1">
        <span className="text-7xl font-thin text-nb-text tabular-nums tracking-tight">{hm}</span>
        <span className="text-3xl font-thin text-nb-text-dim tabular-nums mb-2">:{sec}</span>
      </div>
      <p className="text-sm text-nb-text-muted">{date}</p>
    </div>
  )
}

// ── Quick link card ───────────────────────────────────────────────────────────

function QuickCard({ title, url, favicon, emoji, onNavigate, onRemove }: {
  title: string; url: string; favicon?: string; emoji?: string
  onNavigate: (url: string) => void
  onRemove?: () => void
}) {
  return (
    <div className="group relative flex flex-col items-center gap-2 cursor-pointer" onClick={() => onNavigate(url)}>
      <div className="w-14 h-14 rounded-2xl bg-nb-card/80 hover:bg-nb-raised/80 border border-nb-border/50 hover:border-nb-border
                      flex items-center justify-center transition-all duration-150 shadow-sm hover:shadow-md hover:-translate-y-0.5">
        <SiteFavicon url={url} favicon={favicon} emoji={emoji} />
      </div>
      <span className="text-xs text-nb-text-dim group-hover:text-nb-text-soft text-center max-w-[72px] truncate transition-colors">
        {title}
      </span>
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove() }}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-nb-raised border border-nb-border
                     text-nb-text-dim hover:text-nb-text hover:bg-red-600 opacity-0 group-hover:opacity-100
                     flex items-center justify-center transition-all"
        >
          <X size={10} />
        </button>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NewTabPage({ onNavigate, bookmarks, history }: Props) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')

  const handleSearch = () => {
    const q = search.trim()
    if (!q) return
    if (/^[a-z][a-z\d+\-.]*:\/\//i.test(q)) onNavigate(q)
    else if (q.includes('.') && !q.includes(' ')) onNavigate('https://' + q)
    else onNavigate(`https://www.google.com/search?q=${encodeURIComponent(q)}`)
  }

  // If user has bookmarks → group ALL of them by category for the main grid.
  // If no bookmarks yet → fall back to default links.
  const hasBookmarks = bookmarks.length > 0

  const grouped = hasBookmarks
    ? bookmarks.reduce<Record<string, BookmarkItem[]>>((acc, bm) => {
        const cat = categorize(bm.url)
        if (!acc[cat]) acc[cat] = []
        acc[cat].push(bm)
        return acc
      }, {})
    : {}

  // Default links shown when there are no bookmarks
  const defaultLinks = DEFAULT_LINKS

  // Recent history (deduplicate by hostname, top 8)
  const seen = new Set<string>()
  const recent = history.filter(h => {
    try {
      const host = new URL(h.url).hostname
      if (seen.has(host) || !h.url || h.url.startsWith('about:')) return false
      seen.add(host); return true
    } catch { return false }
  }).slice(0, 8)

  return (
    <div className="absolute inset-0 bg-nb-base overflow-y-auto scrollbar-thin">
      <div className="flex flex-col items-center px-8 pt-14 pb-12 gap-8 min-h-full">

        {/* Logo */}
        <img src="./logo.png" alt="UrchinAI" className="w-20 h-20 object-contain rounded-2xl" />

        {/* Clock */}
        <LiveClock />

        {/* Search bar */}
        <div className="w-full max-w-xl">
          <div className="flex items-center gap-3 bg-nb-card border border-nb-border hover:border-nb-text-muted
                          focus-within:border-brand-500 rounded-2xl px-4 py-3 shadow-sm transition-all">
            <Search size={18} className="text-nb-text-muted shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
              placeholder={t('newTab.searchPlaceholder')}
              className="flex-1 bg-transparent text-base text-nb-text placeholder:text-nb-text-muted outline-none"
            />
          </div>
        </div>

        {/* ── Bookmarks (primary content) ────────────────────────────────── */}
        {hasBookmarks ? (
          <div className="w-full max-w-2xl space-y-7">
            {Object.entries(grouped).map(([cat, items]) => {
              const rule = CATEGORY_RULES.find(r => r.name === cat)
              return (
                <div key={cat}>
                  <h2 className="text-xs font-semibold text-nb-text-muted uppercase tracking-widest mb-4 flex items-center gap-1.5">
                    {rule?.icon && <span>{rule.icon}</span>}
                    <span>{cat}</span>
                  </h2>
                  <div className="grid grid-cols-6 gap-x-4 gap-y-5 justify-items-center">
                    {items.map((bm, i) => (
                      <QuickCard
                        key={i}
                        title={bm.title || bm.url}
                        url={bm.url}
                        favicon={bm.favicon}
                        onNavigate={onNavigate}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* ── No bookmarks → show default shortcuts ─────────────────────── */
          <div className="w-full max-w-2xl">
            <h2 className="text-xs font-semibold text-nb-text-muted uppercase tracking-widest mb-4">{t('newTab.defaultLinks')}</h2>
            <div className="grid grid-cols-6 gap-x-4 gap-y-5 justify-items-center">
              {defaultLinks.map((link, i) => (
                <QuickCard
                  key={i}
                  title={link.title}
                  url={link.url}
                  emoji={link.emoji}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
            <p className="mt-6 text-center text-xs text-nb-text-muted">
              {t('newTab.addBookmarkHint')}
            </p>
          </div>
        )}

        {/* Recent history */}
        {recent.length > 0 && (
          <div className="w-full max-w-2xl">
            <h2 className="text-xs font-semibold text-nb-text-muted uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Clock size={11} /> {t('newTab.recent')}
            </h2>
            <div className="flex gap-2 flex-wrap">
              {recent.map((h, i) => (
                <button
                  key={i}
                  onClick={() => onNavigate(h.url)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-nb-card border border-nb-border
                             hover:bg-nb-raised hover:border-nb-text-muted text-nb-text-dim hover:text-nb-text-soft
                             text-xs transition-all shadow-sm"
                >
                  {h.favicon
                    ? <img src={h.favicon} className="w-3.5 h-3.5 object-contain" alt="" onError={e => { (e.target as HTMLImageElement).style.display='none' }} />
                    : <Globe size={12} className="opacity-60" />}
                  <span className="max-w-[140px] truncate">{h.title || h.url}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
