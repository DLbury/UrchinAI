import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN.json'
import en from './locales/en.json'

const STORAGE_KEY = 'urchin-lang'

function getStoredLang(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || (navigator.language.startsWith('zh') ? 'zh-CN' : 'en')
  } catch {
    return 'zh-CN'
  }
}

i18n.use(initReactI18next).init({
  resources: { 'zh-CN': { translation: zhCN }, en: { translation: en } },
  lng: getStoredLang(),
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(STORAGE_KEY, lng)
  } catch (_) {}
})

export default i18n
