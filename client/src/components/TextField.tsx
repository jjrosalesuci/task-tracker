import type { InputHTMLAttributes } from 'react'
import { Icon } from './Icons'

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  icon: string
  type?: 'text' | 'email'
}

export function TextField({ icon, type = 'text', ...props }: TextFieldProps) {
  return (
    <div className="input-with-icon">
      <Icon name={icon} className="input-icon" />
      <input type={type} {...props} />
    </div>
  )
}
