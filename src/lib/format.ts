import i18n, { getLanguage } from '../i18n'

function intl(): string {
  return getLanguage(i18n.language).intl
}

export function hasSameDay(a: number | Date, b: number | Date): boolean {
  const da = a instanceof Date ? a : new Date(a)
  const db = b instanceof Date ? b : new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

/** Time only, e.g. "14:05" */
export function formatTime(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts)
  return d.toLocaleTimeString(intl(), { hour: '2-digit', minute: '2-digit' })
}

/** Date + time, e.g. "Mar 5, 14:05" / "۵ مارس، ۱۴:۰۵" */
export function formatDateTime(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts)
  return d.toLocaleString(intl(), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Date only, e.g. "Mar 5" / "۵ مارس" */
export function formatDate(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts)
  return d.toLocaleDateString(intl(), { month: 'short', day: 'numeric' })
}

/** Compact timestamp for message bubbles — time if today, otherwise date + time */
export function formatMessageTime(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts)
  if (hasSameDay(d, new Date())) return formatTime(d)
  return formatDateTime(d)
}

/** Live clock parts for the new-tab page */
export function formatClock(now: Date): { hm: string; sec: string; date: string } {
  const locale = intl()
  const hm = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
  const sec = now.toLocaleTimeString(locale, { second: '2-digit' }).replace(/.*:/, '')
  const date = now.toLocaleDateString(locale, { month: 'short', day: 'numeric', weekday: 'short' })
  return { hm, sec, date }
}

/** Stable "YYYY-MM-DD HH:mm" for config-style timestamps */
export function formatStamp(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function formatNumber(n: number): string {
  return n.toLocaleString(intl())
}
