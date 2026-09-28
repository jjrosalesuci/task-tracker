import { useState, type FormEvent, type ReactNode } from 'react'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { ErrorBanner } from '../components/ErrorBanner'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { api } from '../lib/api'
import { navigate } from '../hooks/useRoute'

function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  return (
    <main className="auth-page">
      <div className="auth-language"><LanguageSwitch /></div>
      <section className="auth-brand" aria-label={t('appName')}>
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
        <h1>{t('appName')}</h1><p>{t('tagline')}</p>
      </section>
      <section className="auth-panel">{children}</section>
    </main>
  )
}

function Link({ to, children }: { to: string; children: ReactNode }) {
  return <a href={to} onClick={(event) => { event.preventDefault(); navigate(to) }}>{children}</a>
}

export function LoginPage() {
  const { t } = useI18n()
  const { login } = useAuth()
  const [error, setError] = useState<unknown>()
  const [submitting, setSubmitting] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSubmitting(true); setError(undefined)
    try {
      await login({ email: String(data.get('email')), password: String(data.get('password')) })
      navigate('/', true)
    } catch (caught) { setError(caught) } finally { setSubmitting(false) }
  }
  return <AuthLayout><form className="auth-card" onSubmit={submit}><h2>{t('login')}</h2>{error && <ErrorBanner error={error} />}<label>{t('email')}<input name="email" type="email" autoComplete="email" required autoFocus /></label><label>{t('password')}<input name="password" type="password" autoComplete="current-password" required /></label><div className="field-link"><Link to="/forgot-password">{t('forgotPassword')}</Link></div><button className="button button-primary button-wide" disabled={submitting}>{submitting ? t('loading') : t('login')}</button><p className="auth-alternate">{t('noAccount')} <Link to="/register">{t('register')}</Link></p></form></AuthLayout>
}

export function RegisterPage() {
  const { t } = useI18n()
  const { register } = useAuth()
  const [error, setError] = useState<unknown>()
  const [validation, setValidation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password'))
    if (password !== String(data.get('confirmPassword'))) { setValidation(t('passwordMismatch')); return }
    setValidation(''); setError(undefined); setSubmitting(true)
    try {
      await register({ name: String(data.get('name')), email: String(data.get('email')), password })
      navigate('/', true)
    } catch (caught) { setError(caught) } finally { setSubmitting(false) }
  }
  return <AuthLayout><form className="auth-card" onSubmit={submit}><h2>{t('register')}</h2>{error && <ErrorBanner error={error} />}{validation && <p className="field-error" role="alert">{validation}</p>}<label>{t('name')}<input name="name" autoComplete="name" required autoFocus /></label><label>{t('email')}<input name="email" type="email" autoComplete="email" required /></label><label>{t('password')}<input name="password" type="password" minLength={8} autoComplete="new-password" required /><small>{t('passwordHint')}</small></label><label>{t('confirmPassword')}<input name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required /></label><button className="button button-primary button-wide" disabled={submitting}>{submitting ? t('loading') : t('register')}</button><p className="auth-alternate">{t('haveAccount')} <Link to="/login">{t('login')}</Link></p></form></AuthLayout>
}

export function ForgotPasswordPage() {
  const { t } = useI18n()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<unknown>()
  const [submitting, setSubmitting] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError(undefined)
    try { await api('/auth/forgot-password', { method: 'POST', body: { email: String(new FormData(event.currentTarget).get('email')) } }); setSent(true) }
    catch (caught) { setError(caught) } finally { setSubmitting(false) }
  }
  return <AuthLayout><form className="auth-card" onSubmit={submit}><h2>{t('forgotPassword')}</h2>{error && <ErrorBanner error={error} />}{sent ? <div className="success-message" role="status">{t('resetSent')}</div> : <><label>{t('email')}<input name="email" type="email" autoComplete="email" required autoFocus /></label><button className="button button-primary button-wide" disabled={submitting}>{submitting ? t('loading') : t('sendResetLink')}</button></>}<p className="auth-alternate"><Link to="/login">{t('backToLogin')}</Link></p></form></AuthLayout>
}

export function ResetPasswordPage() {
  const { t } = useI18n()
  const token = new URLSearchParams(window.location.search).get('token')
  const [done, setDone] = useState(false)
  const [validation, setValidation] = useState('')
  const [error, setError] = useState<unknown>()
  const [submitting, setSubmitting] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget), password = String(data.get('password'))
    if (password !== String(data.get('confirmPassword'))) { setValidation(t('passwordMismatch')); return }
    setValidation(''); setSubmitting(true); setError(undefined)
    try { await api('/auth/reset-password', { method: 'POST', body: { token, password } }); setDone(true) }
    catch (caught) { setError(caught) } finally { setSubmitting(false) }
  }
  return <AuthLayout><form className="auth-card" onSubmit={submit}><h2>{t('resetPassword')}</h2>{!token && <p className="field-error" role="alert">{t('invalidResetLink')}</p>}{error && <ErrorBanner error={error} />}{done ? <div className="success-message" role="status">{t('passwordReset')}</div> : token && <>{validation && <p className="field-error" role="alert">{validation}</p>}<label>{t('password')}<input name="password" type="password" minLength={8} autoComplete="new-password" required autoFocus /><small>{t('passwordHint')}</small></label><label>{t('confirmPassword')}<input name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required /></label><button className="button button-primary button-wide" disabled={submitting}>{submitting ? t('loading') : t('resetPassword')}</button></>}<p className="auth-alternate"><Link to="/login">{t('backToLogin')}</Link></p></form></AuthLayout>
}
