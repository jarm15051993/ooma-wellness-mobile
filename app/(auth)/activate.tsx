import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { C, F } from '@/constants/theme'

export default function ActivateScreen() {
  const { t } = useTranslation()
  const { token, email } = useLocalSearchParams<{ token: string; email: string }>()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')

  useEffect(() => {
    if (!token) {
      showInvalidAlert()
      return
    }
    activate()
  }, [token])

  async function activate() {
    try {
      const { data } = await api.get(`/api/auth/activate?token=${encodeURIComponent(token)}`)

      if (data.onboardingCompleted) {
        Alert.alert(
          t('auth.activate.success'),
          t('auth.activate.successMessage'),
          [{ text: t('auth.activate.continueButton'), onPress: () => router.replace('/(auth)/login') }]
        )
        return
      }

      if (data.userId) {
        router.replace(`/(auth)/complete-profile?userId=${data.userId}&email=${encodeURIComponent(email ?? '')}`)
        return
      }

      showInvalidAlert()
    } catch {
      showInvalidAlert()
    }
  }

  function showInvalidAlert() {
    setStatus('error')
    Alert.alert(
      t('auth.activate.error'),
      t('auth.activate.errorMessage'),
      [{ text: t('common.ok'), onPress: () => router.replace('/(auth)/login') }]
    )
  }

  return (
    <View style={styles.container}>
      {status === 'loading' && (
        <>
          <ActivityIndicator size="large" color={C.burg} />
          <Text style={styles.label}>{t('auth.activate.activating')}</Text>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center' },
  label: {
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.midGray,
    marginTop: 16,
  },
})
