import i18n from '../i18n'
import { DEFAULT_ICON_NAME } from './icons'

export interface CategoryLike {
  id: string
  name: string
  name_en?: string
  name_fa?: string
  icon?: string
}

/**
 * Resolve a category's display name for the active language.
 *
 * Preset categories come from the translation catalogue so all three languages
 * stay in sync. Custom (user-created) categories fall back to the per-language
 * fields returned by the backend.
 */
export function categoryDisplayName(cat: CategoryLike | undefined, lang: string = i18n.language): string {
  if (!cat) return ''
  const presetKey = `categories.${cat.id}`
  if (i18n.exists(presetKey)) return i18n.t(presetKey) as string
  if (lang === 'zh-CN') return cat.name || cat.id
  if (lang === 'fa') return cat.name_fa || cat.name_en || cat.name || cat.id
  return cat.name_en || cat.name || cat.id
}

export function categoryIconName(cat: CategoryLike | undefined): string {
  return cat?.icon || DEFAULT_ICON_NAME
}

/** Map of id → category for quick lookup. */
export function categoryMap(list: CategoryLike[]): Map<string, CategoryLike> {
  return new Map(list.map(c => [c.id, c]))
}

export interface BookmarkLike { url: string; category?: string }

const RULES: [string, RegExp][] = [
  ['entertainment', /youtube|bilibili|netflix|iqiyi|youku|vimeo|twitch|douyin/],
  ['social', /twitter|x\.com|facebook|instagram|weibo|linkedin|tiktok|discord/],
  ['shopping', /amazon|taobao|jd\.com|tmall|pinduoduo|ebay|aliexpress|shopify/],
  ['tools', /github|gitlab|stackoverflow|npmjs|pypi|vercel|railway|cloudflare|docker|google|baidu|bing|duckduckgo/],
  ['news', /news|bbc|cnn|xinhua|sina\.com|sohu|people\.com|reuters|theguardian/],
  ['ai', /openai|chatgpt|claude|gemini|deepseek|huggingface|cohere|midjourney/],
  ['finance', /bank|alipay|paypal|finance|trading|invest|stock|fund|crypto/],
]

/** Local fallback categorization when a bookmark has no stored category. */
export function fallbackCategorize(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase()
    for (const [cat, pattern] of RULES) {
      if (pattern.test(host)) return cat
    }
  } catch { /* invalid URL */ }
  return 'other'
}
