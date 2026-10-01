import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../contexts/I18nContext'
import { navigate } from '../hooks/useRoute'
import { api } from '../lib/api'
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from './AuthPages'

const { login, register } = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn() }))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false, login, register, logout: vi.fn() }),
}))

const request = vi.mocked(api)
vi.mock('../lib/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/api')>(),
  api: vi.fn(),
}))

vi.mock('../hooks/useRoute', () => ({ navigate: vi.fn(), useRoute: () => '/login' }))

function renderAuth(node: React.ReactNode, locale = 'es') {
  localStorage.setItem('locale', locale)
  return render(<I18nProvider>{node}</I18nProvider>)
}

function getPasswordInput(name: string) {
  return screen.getAllByRole('button', { name })[0].previousElementSibling as HTMLInputElement
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.pushState({}, '', '/login')
})
afterEach(() => { cleanup() })

describe('LoginPage', () => {
  it('renders branded form with icon inputs and password toggle', async () => {
    renderAuth(<LoginPage />)
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByText('Bienvenido de nuevo. Ingresa con tu cuenta para continuar.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Correo electrónico' })).toHaveAttribute('placeholder', 'tu@correo.com')
    const password = getPasswordInput('Mostrar contraseña')
    expect(password).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))
    expect(getPasswordInput('Ocultar contraseña')).toHaveAttribute('type', 'text')
  })

  it('submits login credentials and navigates home', async () => {
    renderAuth(<LoginPage />)
    login.mockResolvedValueOnce(undefined)
    await userEvent.type(screen.getByRole('textbox', { name: 'Correo electrónico' }), 'juan@example.com')
    await userEvent.type(getPasswordInput('Mostrar contraseña'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    await waitFor(() => expect(login).toHaveBeenCalledWith({ email: 'juan@example.com', password: 'secret123' }))
    expect(navigate).toHaveBeenCalledWith('/', true)
  })

  it('shows error when login fails', async () => {
    renderAuth(<LoginPage />)
    const { ApiError } = await import('../lib/api')
    login.mockRejectedValueOnce(new ApiError('invalid login', 400))
    await userEvent.type(screen.getByRole('textbox', { name: 'Correo electrónico' }), 'juan@example.com')
    await userEvent.type(getPasswordInput('Mostrar contraseña'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/correo o la contraseña/i)
  })
})

describe('RegisterPage', () => {
  it('validates matching passwords before submitting', async () => {
    renderAuth(<RegisterPage />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Nombre' }), 'Juan')
    await userEvent.type(screen.getByRole('textbox', { name: 'Correo electrónico' }), 'juan@example.com')
    const passwordInputs = screen.getAllByPlaceholderText('Ingresa tu contraseña')
    await userEvent.type(passwordInputs[0], 'secret123')
    await userEvent.type(passwordInputs[1], 'different')
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it('submits registration when passwords match', async () => {
    renderAuth(<RegisterPage />)
    register.mockResolvedValueOnce(undefined)
    await userEvent.type(screen.getByRole('textbox', { name: 'Nombre' }), 'Juan')
    await userEvent.type(screen.getByRole('textbox', { name: 'Correo electrónico' }), 'juan@example.com')
    const passwordInputs = screen.getAllByPlaceholderText('Ingresa tu contraseña')
    await userEvent.type(passwordInputs[0], 'secret123')
    await userEvent.type(passwordInputs[1], 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    await waitFor(() => expect(register).toHaveBeenCalledWith({ name: 'Juan', email: 'juan@example.com', password: 'secret123' }))
    expect(navigate).toHaveBeenCalledWith('/', true)
  })
})

describe('ForgotPasswordPage', () => {
  it('sends reset email and shows success message', async () => {
    renderAuth(<ForgotPasswordPage />)
    request.mockResolvedValueOnce(undefined)
    await userEvent.type(screen.getByRole('textbox', { name: 'Correo electrónico' }), 'juan@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('/auth/forgot-password', { method: 'POST', body: { email: 'juan@example.com' } }))
    expect(screen.getByText('Si existe una cuenta, recibirás un correo con las instrucciones.')).toBeInTheDocument()
  })
})

describe('ResetPasswordPage', () => {
  it('shows invalid link message when token is missing', () => {
    renderAuth(<ResetPasswordPage />)
    expect(screen.getByText('El enlace de restablecimiento no es válido.')).toBeInTheDocument()
  })

  it('submits new password with token', async () => {
    window.history.pushState({}, '', '/reset-password?token=abc123')
    renderAuth(<ResetPasswordPage />)
    request.mockResolvedValueOnce(undefined)
    const passwordInputs = screen.getAllByPlaceholderText('Ingresa tu contraseña')
    await userEvent.type(passwordInputs[0], 'newsecret123')
    await userEvent.type(passwordInputs[1], 'newsecret123')
    await userEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña' }))
    await waitFor(() => expect(request).toHaveBeenCalledWith('/auth/reset-password', { method: 'POST', body: { token: 'abc123', password: 'newsecret123' } }))
    expect(screen.getByText('Contraseña actualizada. Ya puedes iniciar sesión.')).toBeInTheDocument()
  })
})

describe('AuthLayout branding', () => {
  it('renders product headline and value props in left panel', () => {
    renderAuth(<LoginPage />)
    expect(screen.getByText(/organiza hoy/i)).toBeInTheDocument()
    expect(screen.getByText('Tu matriz de productividad para enfocarte en lo que realmente suma.')).toBeInTheDocument()
    expect(screen.getByText('Prioriza tus tareas')).toBeInTheDocument()
    expect(screen.getByText(/no es sobre hacer más/i)).toBeInTheDocument()
  })

  it('switches language via top-right selector', async () => {
    renderAuth(<LoginPage />)
    const select = screen.getByRole('combobox', { name: 'Idioma' })
    await userEvent.selectOptions(select, 'en')
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})
