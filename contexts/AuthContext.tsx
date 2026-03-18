import React, { createContext, useContext, useEffect, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { api } from '@/lib/api'

type User = {
  id: string
  name: string
  lastName: string
  email: string
  phone: string | null
  profilePicture: string | null
  credits: number
  onboardingCompleted: boolean
  qrCode: string | null
}

type AuthContextType = {
  user: User | null
  token: string | null
  isAdmin: boolean
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

function decodeJwtIsAdmin(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.isAdmin === true
  } catch {
    return false
  }
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function restore() {
      try {
        const stored = await SecureStore.getItemAsync('access_token')
        if (stored) {
          setToken(stored)
          setIsAdmin(decodeJwtIsAdmin(stored))
          const { data } = await api.get('/api/mobile/me')
          setUser(data.user)
        }
      } catch {
        await SecureStore.deleteItemAsync('access_token')
      } finally {
        setIsLoading(false)
      }
    }
    restore()
  }, [])

  async function signIn(email: string, password: string) {
    const { data } = await api.post('/api/mobile/auth/signin', { email, password })
    await SecureStore.setItemAsync('access_token', data.token)
    setToken(data.token)
    setIsAdmin(decodeJwtIsAdmin(data.token))
    setUser(data.user)
  }

  async function signOut() {
    await SecureStore.deleteItemAsync('access_token')
    setToken(null)
    setIsAdmin(false)
    setUser(null)
  }

  async function refreshUser() {
    const { data } = await api.get('/api/mobile/me')
    setUser(data.user)
  }

  return (
    <AuthContext.Provider value={{ user, token, isAdmin, isLoading, signIn, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
