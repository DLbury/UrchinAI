import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import i18n, { LANGUAGES, type LangCode } from '../i18n'

/**
 * Compact multi-language selector.
 *
 * Each option is labelled in its own endonym so it stays identifiable no matter
 * which language the rest of the UI is currently rendered in.
 */
export default function LanguagePicker({ className = '' }: { className?: string }) {
  // Subscribes to language changes so the active option stays in sync
  useTranslation()
  const current = i18n.language as LangCode

  return (
    <div className={`flex items-center gap-1.5 bg-nb-raised rounded-xl p-1 shrink-0 ${className}`}>
      {LANGUAGES.map(lang => {
        const active = current === lang.code
        return (
          <button
            key={lang.code}
            onClick={() => void i18n.changeLanguage(lang.code)}
            aria-pressed={active}
            title={lang.nativeName}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              active
                ? 'bg-nb-card text-nb-text shadow-sm'
                : 'text-nb-text-dim hover:text-nb-text'
            }`}
          >
            {active && <Check size={11} className="text-brand-400 shrink-0" />}
            <span dir="auto">{lang.nativeName}</span>
          </button>
        )
      })}
    </div>
  )
}
