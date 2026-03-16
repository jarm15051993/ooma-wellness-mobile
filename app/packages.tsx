import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useStripe } from '@stripe/stripe-react-native'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { C, F } from '@/constants/theme'

const PACKAGES = [
  { id: '1', name: '1 Class', classes: 1, price: 10, description: 'Perfect for trying out OOMA' },
  { id: '2', name: '2 Classes', classes: 2, price: 15, description: 'Save €5 per class' },
  { id: '3', name: '5 Classes', classes: 5, price: 35, description: 'Best value — save €15' },
]

export default function PackagesScreen() {
  const router = useRouter()
  const { refreshUser } = useAuth()
  const { initPaymentSheet, presentPaymentSheet } = useStripe()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function handlePurchase(packageId: string) {
    setLoadingId(packageId)
    try {
      const { data } = await api.post('/api/mobile/checkout', { packageId })

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: data.clientSecret,
        merchantDisplayName: 'OOMA Wellness',
        style: 'alwaysLight',
      })
      if (initError) throw new Error(initError.message)

      const { error: presentError } = await presentPaymentSheet()
      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert('Payment failed', presentError.message)
        }
        return
      }

      // Extract paymentIntentId from clientSecret (format: pi_xxx_secret_yyy)
      const paymentIntentId = data.clientSecret.split('_secret_')[0]
      // Brief delay to let Stripe finalize PaymentIntent status server-side
      await new Promise(resolve => setTimeout(resolve, 1500))
      await api.post('/api/mobile/payment-confirm', { paymentIntentId })
      await refreshUser()
      Alert.alert('Payment successful', 'Your credits have been added to your account.')
      router.back()
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Something went wrong'
      Alert.alert('Error', msg)
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <View style={styles.headingRow}>
              <Text style={styles.headingRegular}>Buy </Text>
              <Text style={styles.headingItalic}>Classes</Text>
            </View>
            <Text style={styles.subtitle}>Choose the package that suits you</Text>
          </View>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Package cards */}
        {PACKAGES.map((pkg) => {
          const isLoading = loadingId === pkg.id
          const perClass = (pkg.price / pkg.classes).toFixed(2)
          return (
            <View key={pkg.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.packageName}>{pkg.name}</Text>
                <Text style={styles.packagePrice}>€{pkg.price}</Text>
              </View>
              <Text style={styles.packageDesc}>{pkg.description}</Text>
              {pkg.classes > 1 && (
                <Text style={styles.perClass}>€{perClass} per class</Text>
              )}
              <View style={styles.divider} />
              <TouchableOpacity
                style={[styles.buyBtn, isLoading && styles.btnDisabled]}
                onPress={() => handlePurchase(pkg.id)}
                disabled={loadingId !== null}
              >
                {isLoading
                  ? <ActivityIndicator size="small" color={C.cream} />
                  : <Text style={styles.buyBtnText}>BUY NOW</Text>
                }
              </TouchableOpacity>
            </View>
          )
        })}

        {/* Footer note */}
        <Text style={styles.note}>
          Secure payment via Stripe · Credits added immediately after payment
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.cream,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 48,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 28,
    marginTop: 8,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  headingRegular: {
    fontFamily: F.serifReg,
    fontSize: 32,
    color: C.ink,
  },
  headingItalic: {
    fontFamily: F.serif,
    fontSize: 32,
    color: C.burg,
  },
  subtitle: {
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.midGray,
    marginTop: 4,
    letterSpacing: 0.3,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  closeBtnText: {
    fontSize: 16,
    color: C.midGray,
  },
  card: {
    backgroundColor: C.warmWhite,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    padding: 18,
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  packageName: {
    fontFamily: F.serifBold,
    fontSize: 22,
    color: C.ink,
  },
  packagePrice: {
    fontFamily: F.serifBold,
    fontSize: 28,
    color: C.burg,
  },
  packageDesc: {
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.midGray,
    marginBottom: 2,
  },
  perClass: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.green,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: C.rule,
    marginVertical: 14,
  },
  buyBtn: {
    height: 44,
    backgroundColor: C.ink,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  buyBtnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.cream,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  note: {
    fontFamily: F.sansReg,
    fontSize: 11,
    color: C.lightGray,
    textAlign: 'center',
    marginTop: 8,
    letterSpacing: 0.2,
  },
})
