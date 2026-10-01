import { useI18n } from '../contexts/I18nContext'
import { Icon } from './Icons'

export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n()
  return (
    <label className="language-switch">
      <span className="sr-only">{t('language')}</span>
      <Icon name="globe" className="language-switch-icon" />
      <select value={locale} onChange={(event) => setLocale(event.target.value as 'es' | 'en')} aria-label={t('language')}>
        <option value="es">ES</option>
        <option value="en">EN</option>
      </select>
    </label>
  )
}
