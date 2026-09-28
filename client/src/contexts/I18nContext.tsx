import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { translations, type Locale, type TranslationKey } from '../i18n/translations'

interface I18nValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey, values?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nValue | null>(null)

function initialLocale(): Locale {
  const saved = localStorage.getItem('locale')
  if (saved === 'es' || saved === 'en') return saved
  return navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)
  const setLocale = useCallback((next: Locale) => {
    localStorage.setItem('locale', next)
    setLocaleState(next)
  }, [])
  const t = useCallback(
    (key: TranslationKey, values: Record<string, string | number> = {}) =>
      Object.entries(values).reduce<string>(
        (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
        translations[locale][key],
      ),
    [locale],
  )

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within I18nProvider')
  return context
}
