import { useI18n } from '../contexts/I18nContext'
import { ApiError } from '../lib/api'

export function errorMessage(error: unknown, t: ReturnType<typeof useI18n>['t']) {
  if (!(error instanceof ApiError)) return t('genericError')
  if (error.status === 0 || error.message === 'network_error') return t('network_error')
  if (error.status === 401) return t('unauthorized')
  const normalized = error.message.toLowerCase()
  if (normalized.includes('credential') || normalized.includes('password') || normalized.includes('invalid login')) return t('invalidCredentials')
  if (normalized.includes('already') || normalized.includes('in use') || normalized.includes('duplicate')) return t('emailInUse')
  if (normalized.includes('not found')) return t('userNotFound')
  return error.message && !error.message.startsWith('request_failed_') ? error.message : t('genericError')
}

export function ErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n()
  return (
    <div className="error-banner" role="alert">
      <div><strong>{t('errorTitle')}</strong><p>{errorMessage(error, t)}</p></div>
      {onRetry && <button type="button" className="button button-ghost" onClick={onRetry}>{t('retry')}</button>}
    </div>
  )
}
