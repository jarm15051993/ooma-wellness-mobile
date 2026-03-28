import { useEffect, useState, useRef } from 'react'
import { View, ActivityIndicator, TouchableWithoutFeedback, TouchableOpacity, Text, Modal, StyleSheet, Linking } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { setPendingWalletToast } from '@/lib/pendingToast'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { StripeProvider } from '@stripe/stripe-react-native'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { useFonts } from 'expo-font'
import {
  CormorantGaramond_300Light_Italic,
  CormorantGaramond_400Regular,
  CormorantGaramond_600SemiBold,
} from '@expo-google-fonts/cormorant-garamond'
import {
  Montserrat_300Light,
  Montserrat_400Regular,
  Montserrat_500Medium,
} from '@expo-google-fonts/montserrat'
import { C, F } from '@/constants/theme'

function TenantBanner() {
  const { tenantUser, exitTenantSession } = useAuth()
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  if (!tenantUser) return null

  const fullName = [tenantUser.name, tenantUser.lastName].filter(Boolean).join(' ') || tenantUser.email

  return (
    <>
      <View style={s.banner}>
        <Text style={s.bannerText} numberOfLines={1}>
          Tenanting as <Text style={s.bannerBold}>{fullName}</Text> · {tenantUser.email}
        </Text>
        <TouchableOpacity onPress={() => setShowExitConfirm(true)} style={s.exitBtn}>
          <Text style={s.exitBtnText}>Exit</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showExitConfirm} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Exit tenant session?</Text>
            <Text style={s.modalBody}>Exit tenant session for {fullName}?</Text>
            <View style={s.modalButtons}>
              <TouchableOpacity style={s.modalBtnSecondary} onPress={() => setShowExitConfirm(false)}>
                <Text style={s.modalBtnSecondaryText}>Stay</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalBtnPrimary} onPress={() => { setShowExitConfirm(false); exitTenantSession() }}>
                <Text style={s.modalBtnPrimaryText}>Exit Session</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}

function InactivityModal() {
  const { tenantUser, exitTenantSession, lastActivityAt } = useAuth()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!tenantUser) { setVisible(false); return }
    const interval = setInterval(() => {
      if (Date.now() - lastActivityAt.current > 5 * 60 * 1000) {
        setVisible(true)
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [tenantUser])

  if (!visible || !tenantUser) return null

  const fullName = [tenantUser.name, tenantUser.lastName].filter(Boolean).join(' ') || tenantUser.email

  return (
    <Modal visible transparent animationType="fade">
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>Session Expired</Text>
          <Text style={s.modalBody}>
            Your tenant session for {fullName} has expired due to inactivity.
          </Text>
          <TouchableOpacity
            style={[s.modalBtnPrimary, { marginTop: 4 }]}
            onPress={() => { setVisible(false); exitTenantSession(true) }}
          >
            <Text style={s.modalBtnPrimaryText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

function RootLayoutNav() {
  const { user, isLoading, lastActivityAt } = useAuth()
  const segments = useSegments()
  const router = useRouter()
  // Handle deep links — ooma://wallet-added
  useEffect(() => {
    function handleUrl({ url }: { url: string }) {
      if (url?.includes('wallet-added')) {
        setPendingWalletToast()
        router.replace('/(tabs)/profile')
      }
    }
    const sub = Linking.addEventListener('url', handleUrl)
    Linking.getInitialURL().then(url => {
      console.log('[deeplink] initialURL:', url)
      if (url) handleUrl({ url })
    })
    return () => sub.remove()
  }, [router])

  useEffect(() => {
    if (isLoading) return
    const inAuthGroup = segments[0] === '(auth)'
    const onCompleteProfile = segments[1 as number] === 'complete-profile'

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (user && user.onboardingCompleted && inAuthGroup) {
      router.replace('/(tabs)')
    } else if (user && !user.onboardingCompleted && !onCompleteProfile) {
      router.replace(`/(auth)/complete-profile?userId=${user.id}&email=${encodeURIComponent(user.email)}`)
    }
  }, [user, isLoading, segments])

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.burg} />
      </View>
    )
  }

  return (
    <TouchableWithoutFeedback onPress={() => { lastActivityAt.current = Date.now() }}>
      <View style={{ flex: 1 }}>
        <TenantBanner />
        <InactivityModal />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="packages" options={{ presentation: 'modal' }} />
          <Stack.Screen name="admin/search" />
        </Stack>
      </View>
    </TouchableWithoutFeedback>
  )
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    CormorantGaramond_300Light_Italic,
    CormorantGaramond_400Regular,
    CormorantGaramond_600SemiBold,
    Montserrat_300Light,
    Montserrat_400Regular,
    Montserrat_500Medium,
  })

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.burg} />
      </View>
    )
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!}>
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </StripeProvider>
    </GestureHandlerRootView>
  )
}

const s = StyleSheet.create({
  banner: {
    backgroundColor: '#D97706',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingTop: 52,
  },
  bannerText: {
    flex: 1,
    color: '#fff',
    fontFamily: F.sans,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  bannerBold: {
    fontFamily: F.sansMed,
  },
  exitBtn: {
    marginLeft: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  exitBtnText: {
    color: '#fff',
    fontFamily: F.sansMed,
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: C.cream,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    gap: 12,
  },
  modalTitle: {
    fontFamily: F.serifReg,
    fontSize: 20,
    color: C.ink,
  },
  modalBody: {
    fontFamily: F.sans,
    fontSize: 14,
    color: C.ink,
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  modalBtnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.ink,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnSecondaryText: {
    fontFamily: F.sansMed,
    fontSize: 14,
    color: C.ink,
  },
  modalBtnPrimary: {
    flex: 1,
    backgroundColor: C.burg,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnPrimaryText: {
    fontFamily: F.sansMed,
    fontSize: 14,
    color: '#fff',
  },
})
