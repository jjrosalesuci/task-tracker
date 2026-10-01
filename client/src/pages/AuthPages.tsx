import { useState, type FormEvent, type ReactNode } from 'react'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { ErrorBanner } from '../components/ErrorBanner'
import { Icon } from '../components/Icons'
import { PasswordField } from '../components/PasswordField'
import { TextField } from '../components/TextField'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { api } from '../lib/api'
import { navigate } from '../hooks/useRoute'

function Link({ to, children }: { to: string; children: ReactNode }) {
  return <a href={to} onClick={(event) => { event.preventDefault(); navigate(to) }}>{children}</a>
}

function BrandPanel() {
  const { t } = useI18n()
  return (
    <section className="auth-brand" aria-label={t('appName')}>
      <div className="brand-logo">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
        <span>{t('appName')}</span>
      </div>
      <div className="brand-hero">
        <h1><span>{t('productHeadline').split(' ').slice(0, -2).join(' ')}</span><br /><em>{t('productHeadline').split(' ').slice(-2).join(' ')}</em></h1>
        <p className="brand-description">{t('productDescription')}</p>
      </div>
      <ul className="value-props">
        <li><Icon name="checkCircle" /><span>{t('productValue1')}</span></li>
        <li><Icon name="layoutGrid" /><span>{t('productValue2')}</span></li>
        <li><Icon name="bolt" /><span>{t('productValue3')}</span></li>
      </ul>
      <div className="matrix-preview" aria-hidden="true">
        <div className="matrix-preview-header"><span className="brand-mark compact"><span /><span /><span /><span /></span><span>{t('productMatrixTitle')}</span></div>
        <div className="matrix-preview-grid">
          <div className="matrix-preview-cell urgent-important"><span className="matrix-preview-dot" /><span className="matrix-preview-line" /><span className="matrix-preview-line short" /></div>
          <div className="matrix-preview-cell not-urgent-important"><span className="matrix-preview-dot" /><span className="matrix-preview-line" /><span className="matrix-preview-line short" /></div>
          <div className="matrix-preview-cell urgent-not-important"><span className="matrix-preview-dot" /><span className="matrix-preview-line" /><span className="matrix-preview-line short" /></div>
          <div className="matrix-preview-cell not-urgent-not-important"><span className="matrix-preview-dot" /><span className="matrix-preview-line" /><span className="matrix-preview-line short" /></div>
        </div>
      </div>
      <blockquote className="brand-quote">
        <p>“{t('productQuote')}”</p>
      </blockquote>
      <p className="brand-tag">{t('productMatrixTagline')}</p>
    </section>
  )
}

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-language"><LanguageSwitch /></div>
      <BrandPanel />
      <section className="auth-panel">{children}</section>
    </main>
  )
}

function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="auth-card">
      <div className="auth-card-brand">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
        <span>{t('appName')}</span>
      </div>
      <div className="auth-card-header">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {children}
    </div>
  )
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
  return (
    <AuthLayout>
      <AuthCard title={t('login')} subtitle={t('loginSubtitle')}>
        <form onSubmit={submit}>
          {error ? <ErrorBanner error={error} /> : null}
          <label>{t('email')}<TextField icon="mail" name="email" type="email" autoComplete="email" placeholder={t('emailPlaceholder')} required autoFocus /></label>
          <label>{t('password')}<PasswordField name="password" autoComplete="current-password" placeholder={t('passwordPlaceholder')} required /></label>
          <div className="field-link"><Link to="/forgot-password">{t('forgotPassword')}</Link></div>
          <button className="button button-primary button-wide" disabled={submitting}>
            {submitting ? t('loading') : <>{t('login')}<Icon name="arrowRight" /></>}
          </button>
          <div className="auth-divider"><span>{t('language')}</span></div>
          <button type="button" className="button button-google button-wide" disabled>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"/></svg>
            {t('continueWithGoogle')}
          </button>
          <p className="auth-alternate">{t('noAccount')} <Link to="/register">{t('register')}</Link></p>
        </form>
      </AuthCard>
    </AuthLayout>
  )
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
  return (
    <AuthLayout>
      <AuthCard title={t('register')} subtitle={t('registerSubtitle')}>
        <form onSubmit={submit}>
          {error ? <ErrorBanner error={error} /> : null}
          {validation ? <p className="field-error" role="alert">{validation}</p> : null}
          <label>{t('name')}<TextField icon="user" name="name" autoComplete="name" placeholder={t('namePlaceholder')} required autoFocus /></label>
          <label>{t('email')}<TextField icon="mail" name="email" type="email" autoComplete="email" placeholder={t('emailPlaceholder')} required /></label>
          <label>{t('password')}<PasswordField name="password" autoComplete="new-password" placeholder={t('passwordPlaceholder')} required minLength={8} /><small>{t('passwordHint')}</small></label>
          <label>{t('confirmPassword')}<PasswordField name="confirmPassword" autoComplete="new-password" placeholder={t('passwordPlaceholder')} required minLength={8} /></label>
          <button className="button button-primary button-wide" disabled={submitting}>
            {submitting ? t('loading') : <>{t('register')}<Icon name="arrowRight" /></>}
          </button>
          <p className="auth-alternate">{t('haveAccount')} <Link to="/login">{t('login')}</Link></p>
        </form>
      </AuthCard>
    </AuthLayout>
  )
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
  return (
    <AuthLayout>
      <AuthCard title={t('forgotPassword')} subtitle={t('forgotPasswordSubtitle')}>
        <form onSubmit={submit}>
          {error ? <ErrorBanner error={error} /> : null}
          {sent ? <div className="success-message" role="status">{t('resetSent')}</div> : <>
            <label>{t('email')}<TextField icon="mail" name="email" type="email" autoComplete="email" placeholder={t('emailPlaceholder')} required autoFocus /></label>
            <button className="button button-primary button-wide" disabled={submitting}>
              {submitting ? t('loading') : <>{t('sendResetLink')}<Icon name="arrowRight" /></>}
            </button>
          </>}
          <p className="auth-alternate"><Link to="/login">{t('backToLogin')}</Link></p>
        </form>
      </AuthCard>
    </AuthLayout>
  )
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
  return (
    <AuthLayout>
      <AuthCard title={t('resetPassword')} subtitle={t('resetPasswordSubtitle')}>
        <form onSubmit={submit}>
          {!token ? <p className="field-error" role="alert">{t('invalidResetLink')}</p> : null}
          {error ? <ErrorBanner error={error} /> : null}
          {done ? <div className="success-message" role="status">{t('passwordReset')}</div> : token ? <>
            {validation ? <p className="field-error" role="alert">{validation}</p> : null}
            <label>{t('password')}<PasswordField name="password" autoComplete="new-password" placeholder={t('passwordPlaceholder')} required minLength={8} autoFocus /><small>{t('passwordHint')}</small></label>
            <label>{t('confirmPassword')}<PasswordField name="confirmPassword" autoComplete="new-password" placeholder={t('passwordPlaceholder')} required minLength={8} /></label>
            <button className="button button-primary button-wide" disabled={submitting}>
              {submitting ? t('loading') : <>{t('resetPassword')}<Icon name="arrowRight" /></>}
            </button>
          </> : null}
          <p className="auth-alternate"><Link to="/login">{t('backToLogin')}</Link></p>
        </form>
      </AuthCard>
    </AuthLayout>
  )
}
