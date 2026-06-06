import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { C, F } from '@/constants/theme'
import Toast from '@/components/Toast'

const APP_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://oomawellness.shop'

type InactiveUser = {
  id: string
  email: string
  name: string | null
  lastName: string | null
  phone: string | null
  createdAt: string
  activationToken: string | null
}

type Toast = { visible: boolean; message: string }

export default function InactiveUsersScreen() {
  const { signOut, isAdmin, isOwner } = useAuth()
  const isStaff = isAdmin || isOwner
  const insets = useSafeAreaInsets()

  const [allUsers, setAllUsers] = useState<InactiveUser[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resendingIds, setResendingIds] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<Toast>({ visible: false, message: '' })

  useEffect(() => {
    fetchInactiveUsers()
  }, [])

  async function fetchInactiveUsers() {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get('/api/admin/inactive-users')
      setAllUsers(data)
    } catch {
      setError('Failed to load inactive users. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const filtered = query.trim().length === 0
    ? allUsers
    : allUsers.filter(u => {
        const q = query.toLowerCase()
        return (
          u.email.toLowerCase().includes(q) ||
          (u.name ?? '').toLowerCase().includes(q) ||
          (u.lastName ?? '').toLowerCase().includes(q) ||
          (u.phone ?? '').includes(q)
        )
      })

  function showToast(message: string) {
    setToast({ visible: true, message })
  }

  async function handleCopyLink(user: InactiveUser) {
    if (!user.activationToken) return
    const link = `${APP_URL}/activate?token=${user.activationToken}`
    await Clipboard.setStringAsync(link)
    showToast('Activation link copied')
  }

  async function handleResend(user: InactiveUser) {
    if (resendingIds.has(user.id)) return
    setResendingIds(prev => new Set(prev).add(user.id))
    try {
      await api.post('/api/auth/resend-activation', { email: user.email })
      showToast('Activation link sent')
      // refresh so the token state is up to date
      fetchInactiveUsers()
    } catch {
      showToast('Something went wrong. Please try again.')
    } finally {
      setTimeout(() => {
        setResendingIds(prev => {
          const next = new Set(prev)
          next.delete(user.id)
          return next
        })
      }, 4000)
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  }

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View style={s.headerRow}>
          <Text style={s.title}>Inactive Users</Text>
          {isStaff && (
            <TouchableOpacity style={s.logOutBtn} onPress={signOut}>
              <Text style={s.logOutBtnText}>LOG OUT</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={s.subtitle}>Signed up but never completed their profile</Text>
        <TextInput
          style={s.input}
          placeholder="Search by name, email or phone…"
          placeholderTextColor={C.lightGray}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {loading && <ActivityIndicator color={C.burg} style={{ marginTop: 24 }} />}

      {!loading && error && (
        <Text style={s.errorText}>{error}</Text>
      )}

      {!loading && !error && filtered.length === 0 && (
        <Text style={s.emptyText}>No inactive users found.</Text>
      )}

      {!loading && !error && (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          renderItem={({ item }) => {
            const hasToken = !!item.activationToken
            const isResending = resendingIds.has(item.id)
            return (
              <View style={s.row}>
                <View style={s.info}>
                  <Text style={s.email}>{item.email}</Text>
                  <Text style={s.date}>Signed up {formatDate(item.createdAt)}</Text>
                </View>
                <View style={s.actions}>
                  <TouchableOpacity
                    style={[s.btn, !hasToken && s.btnDisabled]}
                    onPress={() => handleCopyLink(item)}
                    disabled={!hasToken}
                  >
                    <Text style={[s.btnText, !hasToken && s.btnTextDisabled]}>
                      Copy link
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.btn, isResending && s.btnDisabled]}
                    onPress={() => handleResend(item)}
                    disabled={isResending}
                  >
                    <Text style={[s.btnText, isResending && s.btnTextDisabled]}>
                      {isResending ? 'Sending…' : 'Resend link'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )
          }}
          ItemSeparatorComponent={() => <View style={s.separator} />}
        />
      )}

      <Toast
        visible={toast.visible}
        message={toast.message}
        onHide={() => setToast({ visible: false, message: '' })}
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.cream,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontFamily: F.serif,
    fontSize: 32,
    color: C.ink,
  },
  logOutBtn: {
    backgroundColor: C.wine,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  logOutBtnText: {
    fontFamily: F.sansMed,
    fontSize: 10,
    color: '#fff',
    letterSpacing: 1,
  },
  subtitle: {
    fontFamily: F.sansReg,
    fontSize: 13,
    color: C.midGray,
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.ink,
    backgroundColor: C.warmWhite,
    marginBottom: 4,
  },
  emptyText: {
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.midGray,
    textAlign: 'center',
    marginTop: 32,
  },
  errorText: {
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.red,
    textAlign: 'center',
    marginTop: 32,
    paddingHorizontal: 20,
  },
  row: {
    paddingVertical: 14,
    gap: 10,
  },
  info: {
    gap: 2,
  },
  email: {
    fontFamily: F.sansMed,
    fontSize: 14,
    color: C.ink,
  },
  date: {
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.midGray,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    borderWidth: 1,
    borderColor: C.burg,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnDisabled: {
    borderColor: C.rule,
  },
  btnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.burg,
    letterSpacing: 0.5,
  },
  btnTextDisabled: {
    color: C.lightGray,
  },
  separator: {
    height: 1,
    backgroundColor: C.rule,
  },
})
