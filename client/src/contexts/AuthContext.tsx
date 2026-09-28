import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError } from '../lib/api'
import type { User } from '../types'

interface Credentials {
  email: string
  password: string
}

interface AuthValue {
  user: User | null
  loading: boolean
  login: (credentials: Credentials) => Promise<void>
  register: (data: Credentials & { name: string }) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

function unwrapUser(payload: User | { user: User }): User {
  return 'user' in payload ? payload.user : payload
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    api<User | { user: User }>('/auth/me')
      .then((payload) => active && setUser(unwrapUser(payload)))
      .catch((error) => {
        if (!(error instanceof ApiError) || error.status !== 401) console.error(error)
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (credentials: Credentials) => {
    const payload = await api<User | { user: User }>('/auth/login', { method: 'POST', body: credentials })
    setUser(unwrapUser(payload))
  }, [])

  const register = useCallback(async (data: Credentials & { name: string }) => {
    const payload = await api<User | { user: User }>('/auth/register', { method: 'POST', body: data })
    setUser(unwrapUser(payload))
  }, [])

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
