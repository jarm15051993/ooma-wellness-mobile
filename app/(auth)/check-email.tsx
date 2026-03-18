import { useState, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Linking, Alert, Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { api } from '@/lib/api'
import { C, F } from '@/constants/theme'

const RESEND_COOLDOWN = 30

export default function CheckEmailScreen() {
  const { email } = useLocalSearchParams<{ email: string }>()
  const router = useRouter()
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN)
  const [resending, setResending] = useState(false)
  const [resendError, setResendError] = useState('')

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown(s => s - 1), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  async function openMailApp() {
    try {
      if (Platform.OS === 'ios') {
        // Opens Apple Mail inbox directly (not compose view)
        const supported = await Linking.canOpenURL('message://')
        if (supported) {
          await Linking.openURL('message://')
          return
        }
      } else {
        // Android: launch Gmail via intent (opens inbox, not compose)
        const gmailIntent = 'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.google.android.gm;end'
        const supported = await Linking.canOpenURL(gmailIntent)
        if (supported) {
          await Linking.openURL(gmailIntent)
          return
        }
        // Fallback: any mail app via intent
        await Linking.openURL('intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_EMAIL;end')
        return
      }
      await Linking.openURL('mailto:')
    } catch {
      Alert.alert('No mail app found', 'Please open your email app manually and check your inbox.')
    }
  }

  async function handleResend() {
    if (cooldown > 0 || resending) return
    setResendError('')
    setResending(true)
    try {
      await api.post('/api/auth/resend-activation', { email, platform: 'mobile' })
      setCooldown(RESEND_COOLDOWN)
    } catch {
      setResendError('Could not resend. Please try again.')
    } finally {
      setResending(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.logo}>OOMA</Text>
        <Text style={styles.clubLabel}>Wellness Club</Text>
        <View style={styles.divider} />

        <Text style={styles.heading}>Check your email</Text>
        <Text style={styles.body}>
          We sent an activation link to{'\n'}
          <Text style={styles.emailHighlight}>{email}</Text>
          {'\n'}Check your inbox.
        </Text>

        <TouchableOpacity style={styles.button} onPress={openMailApp}>
          <Text style={styles.buttonText}>OPEN MAIL APP</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.resendRow, cooldown > 0 && styles.resendDisabled]}
          onPress={handleResend}
          disabled={cooldown > 0 || resending}
        >
          {resending
            ? <ActivityIndicator size="small" color={C.burg} />
            : <Text style={[styles.resendText, cooldown > 0 && styles.resendTextDisabled]}>
                {cooldown > 0
                  ? `Resend email (${cooldown}s)`
                  : 'Resend email'
                }
              </Text>
          }
        </TouchableOpacity>
        {resendError ? <Text style={styles.errorText}>{resendError}</Text> : null}

        <TouchableOpacity style={styles.backRow} onPress={() => router.replace('/(auth)/login')}>
          <Text style={styles.backText}>Back to log in</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },
  inner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logo: {
    fontFamily: F.serifBold,
    fontSize: 40,
    color: C.burg,
    letterSpacing: 6,
  },
  clubLabel: {
    fontFamily: F.sansMed,
    fontSize: 10,
    color: C.burg,
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginTop: 2,
    marginBottom: 20,
  },
  divider: { width: 40, height: 1, backgroundColor: C.rule, marginBottom: 32 },
  heading: {
    fontFamily: F.serifBold,
    fontSize: 28,
    color: C.ink,
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.midGray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 36,
  },
  emailHighlight: {
    fontFamily: F.sansMed,
    color: C.ink,
  },
  button: {
    height: 50,
    backgroundColor: C.ink,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    marginBottom: 24,
  },
  buttonText: {
    fontFamily: F.sansMed,
    fontSize: 12,
    color: C.cream,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  resendRow: { paddingVertical: 8 },
  resendDisabled: { opacity: 0.5 },
  resendText: {
    fontFamily: F.sansMed,
    fontSize: 13,
    color: C.burg,
    textDecorationLine: 'underline',
  },
  resendTextDisabled: { color: C.midGray, textDecorationLine: 'none' },
  errorText: {
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.red,
    marginTop: 6,
    textAlign: 'center',
  },
  backRow: { marginTop: 32, paddingVertical: 8 },
  backText: { fontFamily: F.sansReg, fontSize: 13, color: C.midGray },
})
