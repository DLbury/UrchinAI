import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN.json'
import en from './locales/en.json'
import fa from './locales/fa.json'

export const STORAGE_KEY = 'urchin-lang'
export const ONBOARDING_KEY = 'urchin-onboarded'

export type LangCode = 'en' | 'fa' | 'zh-CN'
export type TextDir = 'ltr' | 'rtl'

export interface LanguageDef {
  code: LangCode
  /** Endonym shown in the picker — always readable regardless of active locale */
  nativeName: string
  /** Short sample of the UI in that language, for the first-run prompt */
  sampleKey: string
  dir: TextDir
  /** BCP-47 tag used for Intl date/number formatting */
  intl: string
}

export const LANGUAGES: LanguageDef[] = [
  { code: 'en',    nativeName: 'English',    sampleKey: 'lang.enSample',    dir: 'ltr', intl: 'en-US' },
  // Persian keeps the LTR chrome: the UI layout is not mirrored for fa.
  // `lang="fa"` is still set, so the bidi algorithm renders Persian runs
  // correctly and Intl date/number formatting stays fa-IR.
  { code: 'fa',    nativeName: 'فارسی',      sampleKey: 'lang.faSample',    dir: 'ltr', intl: 'fa-IR' },
  { code: 'zh-CN', nativeName: '简体中文',    sampleKey: 'lang.zhCNSample', dir: 'ltr', intl: 'zh-CN' },
]

export const DEFAULT_LANG: LangCode = 'en'

export function getLanguage(code: string | undefined): LanguageDef {
  return LANGUAGES.find(l => l.code === code) ?? LANGUAGES[0]
}

/** Native endonym for an i18n language code — used for translation target prompts. */
export function nativeLanguageName(code: string | undefined): string {
  return getLanguage(code).nativeName
}

function detectLang(): LangCode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as LangCode | null
    if (stored && LANGUAGES.some(l => l.code === stored)) return stored
  } catch { /* localStorage unavailable */ }

  const nav = (typeof navigator !== 'undefined' ? navigator.language : '') || ''
  const lower = nav.toLowerCase()
  if (lower.startsWith('zh')) return 'zh-CN'
  if (lower.startsWith('fa') || lower.startsWith('pe')) return 'fa'
  if (lower.startsWith('en')) return 'en'
  return DEFAULT_LANG
}

function applyDocumentLang(lng: string) {
  if (typeof document === 'undefined') return
  const { code, dir } = getLanguage(lng)
  const root = document.documentElement
  root.lang = code
  root.dir = dir
  root.setAttribute('data-lang', code)
}

const initialLang = detectLang()

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    en: { translation: en },
    fa: { translation: fa },
  },
  lng: initialLang,
  fallbackLng: DEFAULT_LANG,
  supportedLngs: LANGUAGES.map(l => l.code),
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
})

i18n.on('languageChanged', (lng: string) => {
  try {
    localStorage.setItem(STORAGE_KEY, lng)
  } catch { /* ignore */ }
  applyDocumentLang(lng)
})

applyDocumentLang(initialLang)

export default i18n
