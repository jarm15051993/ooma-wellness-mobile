import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native'
import { Link } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { C, F } from '@/constants/theme'

export default function LoginScreen() {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin() {
    if (!email) { setError(t('auth.login.enterEmail')); return }
    if (!password) { setError(t('auth.login.enterPassword')); return }
    setError('')
    setLoading(true)
    try {
      await signIn(email.trim().toLowerCase(), password)
    } catch (e: any) {
      setError(e?.response?.data?.error ?? t('auth.login.invalidCredentials'))
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

          <Text style={styles.welcomeLabel}>{t('auth.login.title')}</Text>

          {/* Email */}
          <Text style={styles.fieldLabel}>EMAIL</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholderTextColor={C.lightGray}
          />

          {/* Password */}
          <Text style={styles.fieldLabel}>PASSWORD</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.inputFlex]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="password"
              placeholderTextColor={C.lightGray}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword(v => !v)}
            >
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Login button */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={C.cream} />
              : <Text style={styles.buttonText}>{t('auth.login.signInButton')}</Text>
            }
          </TouchableOpacity>

          {/* Forgot password */}
          <Link href="/(auth)/forgot-password" asChild>
            <TouchableOpacity style={styles.forgotLink}>
              <Text style={styles.forgotText}>{t('auth.login.forgotPassword')}</Text>
            </TouchableOpacity>
          </Link>
        </View>

        {/* Sign up link below card */}
        <Link href="/(auth)/register" asChild>
          <TouchableOpacity style={styles.signupRow}>
            <Text style={styles.signupText}>
              {t('auth.login.noAccount')}{' '}
              <Text style={styles.signupLink}>{t('auth.login.register')}</Text>
            </Text>
          </TouchableOpacity>
        </Link>
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
  welcomeLabel: {
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
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  inputFlex: {
    flex: 1,
    marginBottom: 0,
  },
  eyeBtn: {
    position: 'absolute',
    right: 0,
    height: 48,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeIcon: {
    fontSize: 16,
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
  forgotLink: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  forgotText: {
    fontFamily: F.sansReg,
    fontSize: 13,
    color: C.midGray,
  },
  signupRow: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 8,
  },
  signupText: {
    fontFamily: F.sansReg,
    fontSize: 13,
    color: C.midGray,
  },
  signupLink: {
    fontFamily: F.sansMed,
    color: C.burg,
  },
})
