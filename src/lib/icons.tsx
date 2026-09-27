import type { LucideIcon } from 'lucide-react'
import {
  BookMarked, BookOpen, Bot, Briefcase, Camera, ClipboardList, Clapperboard,
  FileText, Github, Globe, Layers, Link2, MessageCircle, MessagesSquare,
  Newspaper, Pin, Search, ShoppingCart, Sparkles, Tag, Wallet, Wrench, Zap,
} from 'lucide-react'

/**
 * Icon name → lucide component registry.
 *
 * Persisted data (bookmark categories, quick-action scripts) stores a *name*
 * rather than an emoji, so the same data renders consistently in every theme
 * and at every size. Legacy emoji values coming from older data are mapped
 * through LEGACY_EMOJI.
 */
const REGISTRY: Record<string, LucideIcon> = {
  // Bookmark categories
  work: Briefcase,
  study: BookOpen,
  entertainment: Clapperboard,
  shopping: ShoppingCart,
  social: MessagesSquare,
  tools: Wrench,
  news: Newspaper,
  ai: Bot,
  finance: Wallet,
  other: Pin,
  search: Search,
  // Quick links
  github: Github,
  chat: MessageCircle,
  wikipedia: BookMarked,
  // Quick-action scripts
  summarize: FileText,
  screenshot: Camera,
  links: Link2,
  translate: Globe,
  form: ClipboardList,
  allTabs: Layers,
  // Third-party skill hubs
  anthropic: Sparkles,
  // Generic
  script: Zap,
  zap: Zap,
  tag: Tag,
}

/** Emoji values stored by older versions of the app → icon name. */
const LEGACY_EMOJI: Record<string, string> = {
  '💼': 'work',
  '📚': 'study',
  '🎬': 'entertainment',
  '🛒': 'shopping',
  '💬': 'social',
  '🔧': 'tools',
  '📰': 'news',
  '🤖': 'ai',
  '💰': 'finance',
  '📌': 'other',
  '🔍': 'search',
  '💻': 'github',
  '📖': 'wikipedia',
  '📝': 'summarize',
  '📸': 'screenshot',
  '🔗': 'links',
  '🌐': 'translate',
  '📋': 'form',
  '📑': 'allTabs',
  '⚡': 'script',
  '🅰️': 'anthropic',
}

export const DEFAULT_ICON_NAME = 'other'

/** Resolve a stored icon value (icon name or legacy emoji) to a lucide component. */
export function resolveIcon(name: string | undefined | null, fallback: LucideIcon = Tag): LucideIcon {
  if (!name) return fallback
  const key = name.trim()
  if (REGISTRY[key]) return REGISTRY[key]
  const legacy = LEGACY_EMOJI[key]
  if (legacy && REGISTRY[legacy]) return REGISTRY[legacy]
  return fallback
}

/** Every icon name that can be picked/stored. */
export const ICON_NAMES = Object.keys(REGISTRY)

export interface ItemIconProps {
  name: string | undefined | null
  className?: string
  size?: number | string
  strokeWidth?: number
  fallback?: LucideIcon
}

/** Renders the lucide icon for a stored icon name / legacy emoji value. */
export default function ItemIcon({ name, className, size, strokeWidth, fallback }: ItemIconProps) {
  const Cmp = resolveIcon(name, fallback)
  return <Cmp className={className} size={size} strokeWidth={strokeWidth} />
}
