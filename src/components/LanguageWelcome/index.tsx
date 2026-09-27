import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Check, Globe, Sparkles } from 'lucide-react'
import i18n, { LANGUAGES, ONBOARDING_KEY, type LangCode } from '../../i18n'

export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1'
  } catch {
    return true
  }
}

export function completeOnboarding() {
  try {
    localStorage.setItem(ONBOARDING_KEY, '1')
  } catch { /* ignore */ }
}

/**
 * First-run language prompt.
 *
 * Rendered before any language has been chosen, so the choices themselves are
 * labelled in their own endonyms and remain readable in any UI language.
 */
export default function LanguageWelcome({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<LangCode>(i18n.language as LangCode)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const start = () => {
    completeOnboarding()
    if (i18n.language !== selected) void i18n.changeLanguage(selected)
    onDone()
  }

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
      style={{ background: 'rgba(8,11,16,0.9)', backdropFilter: 'blur(14px)' }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="w-full max-w-lg rounded-3xl bg-nb-base border border-nb-border shadow-2xl overflow-hidden">
        <div className="px-7 pt-8 pb-6 text-center">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/25">
            <Globe size={26} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-nb-text flex items-center justify-center gap-2">
            <Sparkles size={17} className="text-brand-400" />
            {t('welcome.title')}
          </h1>
          <p className="mt-2 text-sm text-nb-text-muted leading-relaxed">{t('welcome.subtitle')}</p>
        </div>

        <div className="px-7 pb-7">
          <p className="text-xs font-semibold uppercase tracking-wider text-nb-text-dim mb-3">
            {t('welcome.selectLanguage')}
          </p>
          <div className="grid gap-2" role="radiogroup">
            {LANGUAGES.map(lang => {
              const active = selected === lang.code
              return (
                <button
                  key={lang.code}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelected(lang.code)}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left transition-all duration-150 ${
                    active
                      ? 'border-brand-500 bg-brand-500/10 shadow-sm'
                      : 'border-nb-border bg-nb-card hover:border-brand-500/50 hover:bg-nb-raised'
                  }`}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-nb-text" dir="auto">
                      {lang.nativeName}
                    </span>
                    <span className="block text-xs text-nb-text-muted mt-0.5" dir="auto">
                      {t(lang.sampleKey)}
                    </span>
                  </span>
                  {active
                    ? <Check size={17} className="text-brand-400 shrink-0" />
                    : <span className="w-[17px] shrink-0" />}
                </button>
              )
            })}
          </div>

          <button
            onClick={start}
            className="mt-5 w-full py-3 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 hover:from-brand-500 hover:to-brand-600 text-white text-sm font-semibold transition-all duration-150 active:scale-[0.98] shadow-md shadow-brand-500/20"
          >
            {t('welcome.start')}
          </button>
          <p className="mt-3 text-center text-[11px] text-nb-text-muted/80">{t('welcome.changeLater')}</p>
        </div>
      </div>
    </div>
  )

  if (!mounted) return null
  return createPortal(content, document.body)
}
