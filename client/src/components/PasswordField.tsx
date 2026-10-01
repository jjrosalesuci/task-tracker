import { useState } from 'react'
import { useI18n } from '../contexts/I18nContext'
import { Icon } from './Icons'

interface PasswordFieldProps {
  name: string
  autoComplete: string
  placeholder?: string
  required?: boolean
  minLength?: number
  autoFocus?: boolean
}

export function PasswordField({ name, autoComplete, placeholder, required, minLength, autoFocus }: PasswordFieldProps) {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)
  return (
    <div className="input-with-icon">
      <Icon name="lock" className="input-icon" />
      <input
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible(!visible)}
        aria-label={visible ? t('hidePassword') : t('showPassword')}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} />
      </button>
    </div>
  )
}
