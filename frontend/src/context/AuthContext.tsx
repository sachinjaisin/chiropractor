import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import api, { setAccessToken } from '@/lib/api'

interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  role: 'chiropractor' | 'admin'
  practitioner_id?: string
  practitioner_status?: string
  rejection_reason?: string
  profile_pic_url?: string | null
}
interface SystemConfig {
  subscription_system_disabled: boolean
  token_buying_disabled: boolean
}

interface AuthContextValue {
  user: User | null
  accessToken: string | null
  isLoading: boolean
  walletBalance: number | null
  systemConfig: SystemConfig
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  setUser: (u: User | null) => void
  setToken: (t: string | null) => void
  refreshUser: () => Promise<User | null>
  refreshWallet: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setTokenState] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [systemConfig, setSystemConfig] = useState<SystemConfig>({
    subscription_system_disabled: false,
    token_buying_disabled: false,
  })

  function setToken(t: string | null) {
    setTokenState(t)
    setAccessToken(t)
  }

  const [walletBalance, setWalletBalance] = useState<number | null>(null)

  async function refreshWallet() {
    if (!user || user.role !== 'chiropractor') {
      setWalletBalance(null)
      return
    }
    try {
      const { data } = await api.get('/wallet')
      setWalletBalance(data.balance)
    } catch {
      setWalletBalance(null)
    }
  }

  useEffect(() => {
    if (user && user.role === 'chiropractor') {
      refreshWallet()
    } else {
      setWalletBalance(null)
    }
  }, [user])

  useEffect(() => {
    // Fetch public configurations
    api.get('/public/config')
      .then(({ data }) => setSystemConfig(data))
      .catch((err) => console.error('Failed to load system config:', err))

    // Attempt silent refresh on mount
    api.post('/auth/refresh')
      .then(({ data }) => {
        setToken(data.access_token)
        setUser(data.user ?? null)
      })
      .catch(() => {
        // Refresh failed — clear any stale cookie so the next login works cleanly
        api.post('/auth/logout').catch(() => {})
      })
      .finally(() => setIsLoading(false))
  }, [])

  async function login(email: string, password: string): Promise<User> {
    const { data } = await api.post('/auth/login', { email, password })
    setToken(data.access_token)
    setUser(data.user)
    return data.user as User
  }

  async function logout() {
    // Capture the current token BEFORE clearing state, so we can still
    // authenticate the /auth/logout request (which requires a Bearer token).
    const tokenSnapshot = accessToken

    // Clear auth state immediately so the UI reacts right away
    setToken(null)
    setUser(null)

    // Clear any client‑side persisted data that might affect auth flow
    try {
      localStorage.removeItem('pre_purchase_balance')
    } catch {}

    // Perform a server‑side logout using the saved token so the server can
    // verify and clear the HttpOnly refresh‑token cookie.
    try {
      await api.post('/auth/logout', {}, {
        headers: tokenSnapshot ? { Authorization: `Bearer ${tokenSnapshot}` } : {},
      })
    } catch {
      // Swallow errors – logout should proceed regardless of server response
    }
  }

  async function refreshUser(): Promise<User | null> {
    try {
      const { data } = await api.post('/auth/refresh')
      setToken(data.access_token)
      setUser(data.user ?? null)
      return data.user ?? null
    } catch {
      setToken(null)
      setUser(null)
      return null
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        walletBalance,
        systemConfig,
        login,
        logout,
        setUser,
        setToken,
        refreshUser,
        refreshWallet,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
