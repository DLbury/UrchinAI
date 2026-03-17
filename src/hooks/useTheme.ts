import { useEffect, useState } from 'react'

export type Theme = 'dark' | 'light' | 'system'

const STORAGE_KEY = 'urchin-theme'

function getStoredTheme(): Theme {
  try {
    return (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'system'
  } catch {
    return 'system'
  }
}

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'dark'
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  const effectiveTheme = theme === 'system' ? getSystemTheme() : theme
  root.classList.toggle('dark', effectiveTheme === 'dark')
  root.classList.toggle('light', effectiveTheme === 'light')
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme)

  // 应用主题并监听系统主题变化
  useEffect(() => {
    applyTheme(theme)

    // 如果是 system 模式，监听系统主题变化
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = () => applyTheme('system')

      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme])

  const setTheme = (t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t)
    setThemeState(t)
  }

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark'
    setTheme(next)
  }

  // 计算当前实际显示的主题（用于 UI 判断）
  const effectiveTheme = theme === 'system' ? getSystemTheme() : theme
  const isDark = effectiveTheme === 'dark'

  return { theme, setTheme, toggle, isDark, effectiveTheme }
}