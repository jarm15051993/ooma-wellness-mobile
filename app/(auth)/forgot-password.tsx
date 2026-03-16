import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { api } from '@/lib/api'
import { C, F } from '@/constants/theme'

export default function ForgotPasswordScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!email) {
      setError('Please enter your email.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await api.post('/api/auth/forgot-password', { email: email.trim().toLowerCase() })
      setSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
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
          {/* Logo */}
          <Text style={styles.logo}>OOMA</Text>
          <Text style={styles.clubLabel}>Wellness Club</Text>

          <View style={styles.divider} />

          <Text style={styles.subtitle}>RESET PASSWORD</Text>

          {sent ? (
            <View style={styles.sentContainer}>
              <Text style={styles.sentMessage}>
                Check your email — we've sent a password reset link.
              </Text>
              <TouchableOpacity style={styles.button} onPress={() => router.back()}>
                <Text style={styles.buttonText}>BACK TO LOGIN</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.description}>
                Enter your email and we'll send you a reset link.
              </Text>

              <Text style={styles.fieldLabel}>EMAIL</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholderTextColor={C.lightGray}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color={C.cream} />
                  : <Text style={styles.buttonText}>SEND RESET LINK</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
                <Text style={styles.backText}>← Back to login</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.cream,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
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
  divider: {
    height: 1,
    backgroundColor: C.rule,
    marginBottom: 24,
  },
  subtitle: {
    fontFamily: F.sansMed,
    fontSize: 10,
    color: C.midGray,
    textAlign: 'center',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  description: {
    fontFamily: F.sansReg,
    fontSize: 13,
    color: C.midGray,
    textAlign: 'center',
    lineHeight: 20,
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
    marginBottom: 16,
  },
  errorText: {
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.red,
    marginBottom: 12,
    textAlign: 'center',
  },
  button: {
    height: 50,
    backgroundColor: C.ink,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: F.sansMed,
    fontSize: 12,
    color: C.cream,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  backLink: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  backText: {
    fontFamily: F.sansReg,
    fontSize: 13,
    color: C.midGray,
  },
  sentContainer: {
    gap: 20,
  },
  sentMessage: {
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.ink,
    textAlign: 'center',
    lineHeight: 22,
  },
})
