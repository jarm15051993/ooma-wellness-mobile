import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { C, F } from '@/constants/theme'

export default function RegisterScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleContinue() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) {
      setError(t('auth.forgotPassword.enterEmail'))
      return
    }
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRx.test(trimmed)) {
      setError(t('auth.register.invalidEmail'))
      return
    }
    setError('')
    setLoading(true)
    try {
      await api.post('/api/auth/signup', { email: trimmed, platform: 'mobile' })
      router.push(`/(auth)/check-email?email=${encodeURIComponent(trimmed)}`)
    } catch (e: any) {
      const status = e?.response?.status
      const msg = e?.response?.data?.message ?? e?.response?.data?.error
      if (status === 409) {
        setError(t('errors.accountExists'))
      } else {
        setError(msg ?? t('common.somethingWentWrong'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.logo}>OOMA</Text>
          <Text style={styles.clubLabel}>Wellness Club</Text>
          <View style={styles.divider} />
          <Text style={styles.subtitle}>{t('auth.register.title')}</Text>

          <Text style={styles.fieldLabel}>EMAIL</Text>
          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            value={email}
            onChangeText={t => { setEmail(t); setError('') }}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            autoFocus
            placeholderTextColor={C.lightGray}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={C.cream} />
              : <Text style={styles.buttonText}>{t('common.continue')}</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.loginRow} onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.loginText}>
              {t('auth.register.alreadyHaveAccount')}{' '}
              <Text style={styles.loginLink}>{t('auth.register.signIn')}</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 48 },
  card: {
    backgroundColor: C.warmWhite,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    paddingHorizontal: 28,
    paddingVertical: 36,
  },
  logo: {
    fontFamily: F.serifBold,
    fontSize: 48,
    color: C.burg,
    textAlign: 'center',
    letterSpacing: 6,
  },
  clubLabel: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.burg,
    textAlign: 'center',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginTop: 2,
    marginBottom: 24,
  },
  divider: { height: 1, backgroundColor: C.rule, marginBottom: 24 },
  subtitle: {
    fontFamily: F.sansMed,
    fontSize: 10,
    color: C.midGray,
    textAlign: 'center',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 24,
  },
  fieldLabel: {
    fontFamily: F.sansMed,
    fontSize: 10,
    color: C.midGray,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 2,
    paddingHorizontal: 14,
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.ink,
    backgroundColor: C.warmWhite,
    marginBottom: 4,
  },
  inputError: { borderColor: C.red },
  errorText: {
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.red,
    marginBottom: 12,
  },
  button: {
    height: 50,
    backgroundColor: C.ink,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    fontFamily: F.sansMed,
    fontSize: 12,
    color: C.cream,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  loginRow: { alignItems: 'center', paddingVertical: 4 },
  loginText: { fontFamily: F.sansReg, fontSize: 13, color: C.midGray },
  loginLink: { fontFamily: F.sansMed, color: C.burg },
})
