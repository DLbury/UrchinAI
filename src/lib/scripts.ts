export interface QuickScript {
  id: string
  name: string
  prompt: string
  icon: string
}

type TFn = (key: string, opts?: Record<string, unknown>) => string

/**
 * Locally seeded quick actions.
 *
 * These are built from the translation catalogue so they read in the active
 * language, and they are shown before the backend has responded. The backend
 * list wins as soon as it contains user-created entries.
 */
export function buildDefaultScripts(t: TFn, targetLanguage: string): QuickScript[] {
  return [
    {
      id: 'default-1',
      name: t('scripts.default.summarize.name'),
      prompt: t('scripts.default.summarize.prompt'),
      icon: 'summarize',
    },
    {
      id: 'default-2',
      name: t('scripts.default.screenshot.name'),
      prompt: t('scripts.default.screenshot.prompt'),
      icon: 'screenshot',
    },
    {
      id: 'default-3',
      name: t('scripts.default.links.name'),
      prompt: t('scripts.default.links.prompt'),
      icon: 'links',
    },
    {
      id: 'default-4',
      name: t('scripts.default.translate.name'),
      prompt: t('scripts.default.translate.prompt', { language: targetLanguage }),
      icon: 'translate',
    },
    {
      id: 'default-5',
      name: t('scripts.default.form.name'),
      prompt: t('scripts.default.form.prompt'),
      icon: 'form',
    },
    {
      id: 'default-6',
      name: t('scripts.default.allTabs.name'),
      prompt: t('scripts.default.allTabs.prompt'),
      icon: 'allTabs',
    },
  ]
}

export const DEFAULT_SCRIPT_IDS = [
  'default-1', 'default-2', 'default-3',
  'default-4', 'default-5', 'default-6',
]

/** True when a backend script is not one of the built-in defaults. */
export function isCustomScript(id: string): boolean {
  return !DEFAULT_SCRIPT_IDS.includes(id)
}
