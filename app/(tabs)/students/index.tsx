import { useState, useRef, useCallback, useEffect } from 'react'
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  ActivityIndicator, Modal, StyleSheet,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { api } from '@/lib/api'
import { useAuth, User } from '@/contexts/AuthContext'
import { C, F } from '@/constants/theme'

type SearchResult = {
  id: string
  fullName: string
  email: string
  phone: string
  onboardingCompleted: boolean
}

export default function StudentsScreen() {
  const { isOwner, startTenantSession } = useAuth()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<SearchResult | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.trim().length < 3) {
      setResults([])
      setError(null)
      setLoading(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort()
      abortRef.current = new AbortController()

      setLoading(true)
      setError(null)
      try {
        const { data } = await api.get(`/api/admin/users/search?q=${encodeURIComponent(q.trim())}`)
        setResults(data)
      } catch (e: any) {
        if (e?.name === 'CanceledError' || e?.name === 'AbortError') return
        setError('Search failed. Please try again.')
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  function handleChange(text: string) {
    setQuery(text)
    search(text)
  }

  function handleStartSession() {
    if (!selectedUser) return
    const user: User = {
      id: selectedUser.id,
      name: selectedUser.fullName.split(' ')[0] ?? selectedUser.fullName,
      lastName: selectedUser.fullName.split(' ').slice(1).join(' ') ?? '',
      email: selectedUser.email,
      phone: selectedUser.phone || null,
      profilePicture: null,
      credits: 0,
      onboardingCompleted: selectedUser.onboardingCompleted,
      qrCode: null,
      isBeta: false,
      language: 'es' as const,
      isClubMember: false,
      createdAt: new Date().toISOString(),
    }
    setSelectedUser(null)
    startTenantSession(user)
    router.replace('/(tabs)')
  }

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <Text style={s.title}>Students</Text>
        <Text style={s.subtitle}>Search by name, email or phone</Text>

        <TextInput
          style={s.input}
          placeholder="Search students…"
          placeholderTextColor={C.lightGray}
          value={query}
          onChangeText={handleChange}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && query.trim().length < 3 && (
          <Text style={s.hintText}>Type at least 3 characters to search</Text>
        )}
      </View>

      {loading && <ActivityIndicator color={C.burg} style={{ marginTop: 24 }} />}

      {!loading && error && (
        <Text style={s.errorText}>{error}</Text>
      )}

      {!loading && !error && query.trim().length >= 3 && results.length === 0 && (
        <Text style={s.emptyText}>No students found.</Text>
      )}

      <FlatList
        data={results}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.resultRow}
            onPress={() => isOwner ? setSelectedUser(item) : null}
            activeOpacity={isOwner ? 0.7 : 1}
          >
            <View style={s.resultInfo}>
              <Text style={s.resultName}>{item.fullName}</Text>
              <Text style={s.resultSub}>{item.email}</Text>
              {item.phone ? <Text style={s.resultSub}>{item.phone}</Text> : null}
            </View>
            {isOwner && (
              <TouchableOpacity style={s.sessionBtn} onPress={() => setSelectedUser(item)}>
                <Text style={s.sessionBtnText}>Start Session</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={s.separator} />}
      />

      {/* Confirmation bottom sheet — owners only */}
      {isOwner && (
        <Modal visible={!!selectedUser} transparent animationType="slide">
          <View style={s.sheetOverlay}>
            <View style={s.sheet}>
              <Text style={s.sheetTitle}>Start tenant session?</Text>
              <Text style={s.sheetBody}>
                You are about to tenant into{' '}
                <Text style={{ fontFamily: F.sansMed }}>{selectedUser?.fullName}</Text>'s account.
                All actions will be logged.
              </Text>
              <TouchableOpacity style={s.btnPrimary} onPress={handleStartSession}>
                <Text style={s.btnPrimaryText}>Start Session</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnSecondary} onPress={() => setSelectedUser(null)}>
                <Text style={s.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
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
  title: {
    fontFamily: F.serif,
    fontSize: 32,
    color: C.ink,
    marginBottom: 4,
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
  hintText: {
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.midGray,
    marginBottom: 4,
    paddingHorizontal: 2,
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
  resultRow: {
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resultInfo: {
    flex: 1,
    marginRight: 12,
  },
  resultName: {
    fontFamily: F.sansMed,
    fontSize: 15,
    color: C.ink,
    marginBottom: 2,
  },
  resultSub: {
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.midGray,
  },
  sessionBtn: {
    borderWidth: 1,
    borderColor: C.burg,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sessionBtnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.burg,
    letterSpacing: 0.5,
  },
  separator: {
    height: 1,
    backgroundColor: C.rule,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.cream,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 28,
    gap: 12,
  },
  sheetTitle: {
    fontFamily: F.serifReg,
    fontSize: 22,
    color: C.ink,
  },
  sheetBody: {
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.ink,
    lineHeight: 20,
  },
  btnPrimary: {
    backgroundColor: C.burg,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  btnPrimaryText: {
    fontFamily: F.sansMed,
    fontSize: 14,
    color: '#fff',
    letterSpacing: 0.5,
  },
  btnSecondary: {
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnSecondaryText: {
    fontFamily: F.sansMed,
    fontSize: 14,
    color: C.ink,
  },
})
