import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { AppState } from 'react-native'
import { useRouter } from 'expo-router'
import { api, setTenantUserId } from '@/lib/api'

export type User = {
  id: string
  name: string
  lastName: string
  email: string
  phone: string | null
  profilePicture: string | null
  credits: number
  onboardingCompleted: boolean
  qrCode: string | null
  isBeta: boolean
}

type AuthContextType = {
  user: User | null
  token: string | null
  isAdmin: boolean
  isOwner: boolean
  canCreateClass: boolean
  canViewStudents: boolean
  canValidateAttendance: boolean
  canMarkAsStudent: boolean
  isStudent: boolean
  isBeta: boolean
  isLoading: boolean
  tenantUser: User | null
  lastActivityAt: React.MutableRefObject<number>
  startTenantSession: (user: User) => void
  exitTenantSession: (fromInactivity?: boolean) => void
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

type DecodedPermissions = {
  isAdmin: boolean
  isOwner: boolean
  canCreateClass: boolean
  canViewStudents: boolean
  canValidateAttendance: boolean
  canMarkAsStudent: boolean
  isStudent: boolean
}

function decodeJwtPermissions(token: string): DecodedPermissions {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    const isOwner = payload.role === 'OWNER'
    return {
      isAdmin: payload.isAdmin === true,
      isOwner,
      canCreateClass: isOwner || payload.canCreateClass === true,
      canViewStudents: isOwner || payload.canViewStudents === true,
      canValidateAttendance: isOwner || payload.canValidateAttendance === true,
      canMarkAsStudent: isOwner || payload.canMarkAsStudent === true,
      isStudent: payload.isStudent === true,
    }
  } catch {
    return { isAdmin: false, isOwner: false, canCreateClass: false, canViewStudents: false, canValidateAttendance: false, canMarkAsStudent: false, isStudent: false }
  }
}

const INACTIVITY_LIMIT_MS = 5 * 60 * 1000
const INACTIVITY_CHECK_INTERVAL_MS = 30 * 1000

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [canCreateClass, setCanCreateClass] = useState(false)
  const [canViewStudents, setCanViewStudents] = useState(false)
  const [canValidateAttendance, setCanValidateAttendance] = useState(false)
  const [canMarkAsStudent, setCanMarkAsStudent] = useState(false)
  const [isStudent, setIsStudent] = useState(false)
  const [isBeta, setIsBeta] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [tenantUser, setTenantUser] = useState<User | null>(null)
  const lastActivityAt = useRef<number>(Date.now())
  const router = useRouter()

  function applyPermissions(t: string) {
    const p = decodeJwtPermissions(t)
    setIsAdmin(p.isAdmin)
    setIsOwner(p.isOwner)
    setCanCreateClass(p.canCreateClass)
    setCanViewStudents(p.canViewStudents)
    setCanValidateAttendance(p.canValidateAttendance)
    setCanMarkAsStudent(p.canMarkAsStudent)
    setIsStudent(p.isStudent)
  }

  useEffect(() => {
    async function restore() {
      try {
        const stored = await SecureStore.getItemAsync('access_token')
        if (stored) {
          setToken(stored)
          applyPermissions(stored)
          const { data } = await api.get('/api/mobile/me')
          setUser(data.user)
          setIsBeta(data.user.isBeta ?? false)
        }
      } catch {
        await SecureStore.deleteItemAsync('access_token')
      } finally {
        setIsLoading(false)
      }
    }
    restore()
  }, [])

  // Reset inactivity timer when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') lastActivityAt.current = Date.now()
    })
    return () => sub.remove()
  }, [])

  // Inactivity check — only active when in tenant session
  useEffect(() => {
    if (!tenantUser) return
    const interval = setInterval(() => {
      if (Date.now() - lastActivityAt.current > INACTIVITY_LIMIT_MS) {
        exitTenantSession(true)
      }
    }, INACTIVITY_CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [tenantUser])

  function startTenantSession(targetUser: User) {
    setTenantUser(targetUser)
    setTenantUserId(targetUser.id)
    lastActivityAt.current = Date.now()
  }

  function exitTenantSession(_fromInactivity = false) {
    setTenantUser(null)
    setTenantUserId(null)
    router.replace('/admin/search' as any)
  }

  async function signIn(email: string, password: string) {
    const { data } = await api.post('/api/mobile/auth/signin', { email, password })
    await SecureStore.setItemAsync('access_token', data.token)
    setToken(data.token)
    applyPermissions(data.token)
    setUser(data.user)
    setIsBeta(data.user.isBeta ?? false)
  }

  async function signOut() {
    await SecureStore.deleteItemAsync('access_token')
    setToken(null)
    setIsAdmin(false)
    setIsOwner(false)
    setCanCreateClass(false)
    setCanViewStudents(false)
    setCanValidateAttendance(false)
    setCanMarkAsStudent(false)
    setIsStudent(false)
    setIsBeta(false)
    setUser(null)
    setTenantUser(null)
    setTenantUserId(null)
  }

  async function refreshUser() {
    const { data } = await api.get('/api/mobile/me')
    setUser(data.user)
    setIsBeta(data.user.isBeta ?? false)
  }

  return (
    <AuthContext.Provider value={{
      user, token, isAdmin, isOwner,
      canCreateClass, canViewStudents, canValidateAttendance, canMarkAsStudent, isStudent, isBeta,
      isLoading, tenantUser, lastActivityAt,
      startTenantSession, exitTenantSession,
      signIn, signOut, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
