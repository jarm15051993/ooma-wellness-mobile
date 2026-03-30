import React, { useState, useEffect } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native'
import { useStripe } from '@stripe/stripe-react-native'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { C, F } from '@/constants/theme'

type Package = {
  id: string
  name: string
  description: string | null
  classCount: number
  price: number
  durationDays: number
  isStudentPackage: boolean
  isPurchasable: boolean
}

type Props = {
  visible: boolean
  pendingClassId?: string | null
  onClose: () => void
  onPurchaseAndBooked?: () => void
  onPurchaseOnly?: () => void
}

export default function BuyClassesModal({
  visible,
  pendingClassId,
  onClose,
  onPurchaseAndBooked,
  onPurchaseOnly,
}: Props) {
  const { refreshUser, isStudent } = useAuth()
  const { initPaymentSheet, presentPaymentSheet } = useStripe()
  const [packages, setPackages] = useState<Package[]>([])
  const [loadingPackages, setLoadingPackages] = useState(true)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setLoadingPackages(true)
    api.get('/api/mobile/packages')
      .then(({ data }) => setPackages(data.packages))
      .catch(() => Alert.alert('Error', 'Could not load packages.'))
      .finally(() => setLoadingPackages(false))
  }, [visible])

  async function handlePurchase(pkg: Package) {
    if (!pkg.isPurchasable) {
      Alert.alert('Students only', 'These packages are only available to verified students.')
      return
    }
    setLoadingId(pkg.id)
    try {
      const { data } = await api.post('/api/mobile/checkout', { packageId: pkg.id })

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: data.clientSecret,
        merchantDisplayName: 'OOMA Wellness',
        style: 'alwaysLight',
      })
      if (initError) throw new Error(initError.message)

      const { error: presentError } = await presentPaymentSheet()
      if (presentError) {
        if (presentError.code !== 'Canceled') Alert.alert('Payment failed', presentError.message)
        return
      }

      const paymentIntentId = data.clientSecret.split('_secret_')[0]
      await new Promise(resolve => setTimeout(resolve, 1500))
      await api.post('/api/mobile/payment-confirm', { paymentIntentId })
      await refreshUser()

      if (pendingClassId) {
        try {
          await api.post('/api/bookings', { classId: pendingClassId })
          onClose()
          onPurchaseAndBooked?.()
        } catch {
          onClose()
          onPurchaseOnly?.()
        }
      } else {
        onClose()
        onPurchaseOnly?.()
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Something went wrong'
      Alert.alert('Error', msg)
    } finally {
      setLoadingId(null)
    }
  }

  const regularPackages = packages.filter(p => !p.isStudentPackage)
  const studentPackages = packages.filter(p => p.isStudentPackage)

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <View>
              <View style={styles.headingRow}>
                <Text style={styles.headingRegular}>Buy </Text>
                <Text style={styles.headingItalic}>Classes</Text>
              </View>
              <Text style={styles.subtitle}>
                {pendingClassId ? 'Purchase a pack to book this class' : 'Choose the package that suits you'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} disabled={loadingId !== null}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {loadingPackages ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={C.burg} />
          ) : (
            <>
              {regularPackages.map(pkg => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  loadingId={loadingId}
                  pendingClassId={pendingClassId}
                  onPress={() => handlePurchase(pkg)}
                />
              ))}

              {studentPackages.length > 0 && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Student Packages 🎓</Text>
                    {!isStudent && (
                      <Text style={styles.sectionSubtitle}>Available for verified students only</Text>
                    )}
                  </View>
                  {studentPackages.map(pkg => (
                    <PackageCard
                      key={pkg.id}
                      pkg={pkg}
                      loadingId={loadingId}
                      pendingClassId={pendingClassId}
                      onPress={() => handlePurchase(pkg)}
                      locked={!pkg.isPurchasable}
                    />
                  ))}
                </>
              )}
            </>
          )}

          <Text style={styles.note}>
            Secure payment via Stripe · Credits added immediately after payment
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

function PackageCard({
  pkg,
  loadingId,
  pendingClassId,
  onPress,
  locked = false,
}: {
  pkg: Package
  loadingId: string | null
  pendingClassId?: string | null
  onPress: () => void
  locked?: boolean
}) {
  const isLoading = loadingId === pkg.id
  const perClass = (pkg.price / pkg.classCount).toFixed(2)

  return (
    <View style={[styles.card, locked && styles.cardLocked]}>
      <View style={styles.cardTop}>
        <Text style={[styles.packageName, locked && styles.lockedText]}>{pkg.name}</Text>
        <Text style={[styles.packagePrice, locked && styles.lockedText]}>€{pkg.price}</Text>
      </View>
      {pkg.description && (
        <Text style={styles.packageDesc}>{pkg.description}</Text>
      )}
      {pkg.classCount > 1 && (
        <Text style={[styles.perClass, locked && styles.lockedText]}>€{perClass} per class</Text>
      )}
      {locked && (
        <Text style={styles.lockedBadge}>Available for students only</Text>
      )}
      <View style={styles.divider} />
      <TouchableOpacity
        style={[styles.buyBtn, (isLoading || locked) && styles.btnDisabled, locked && styles.buyBtnLocked]}
        onPress={onPress}
        disabled={loadingId !== null}
      >
        {isLoading
          ? <ActivityIndicator size="small" color={C.cream} />
          : <Text style={styles.buyBtnText}>
              {locked ? 'STUDENTS ONLY' : pendingClassId ? 'BUY & BOOK CLASS' : 'BUY NOW'}
            </Text>
        }
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.cream },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48 },
  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 28, marginTop: 8,
  },
  headingRow: { flexDirection: 'row', alignItems: 'flex-end' },
  headingRegular: { fontFamily: F.serifReg, fontSize: 32, color: C.ink },
  headingItalic: { fontFamily: F.serif, fontSize: 32, color: C.burg },
  subtitle: { fontFamily: F.sansReg, fontSize: 12, color: C.midGray, marginTop: 4, letterSpacing: 0.3 },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  closeBtnText: { fontSize: 16, color: C.midGray },
  sectionHeader: { marginTop: 24, marginBottom: 12 },
  sectionTitle: { fontFamily: F.sansMed, fontSize: 13, color: C.ink, letterSpacing: 0.5 },
  sectionSubtitle: { fontFamily: F.sansReg, fontSize: 11, color: C.midGray, marginTop: 2 },
  card: {
    backgroundColor: C.warmWhite, borderWidth: 1,
    borderColor: C.rule, borderRadius: 4, padding: 18, marginBottom: 12,
  },
  cardLocked: { opacity: 0.65 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  packageName: { fontFamily: F.serifBold, fontSize: 22, color: C.ink },
  packagePrice: { fontFamily: F.serifBold, fontSize: 28, color: C.burg },
  packageDesc: { fontFamily: F.sansReg, fontSize: 12, color: C.midGray, marginBottom: 2 },
  perClass: { fontFamily: F.sansMed, fontSize: 11, color: C.green, letterSpacing: 0.3, marginTop: 2 },
  lockedText: { color: C.midGray },
  lockedBadge: {
    fontFamily: F.sansMed, fontSize: 10, color: C.burgSoft,
    letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 6,
  },
  divider: { height: 1, backgroundColor: C.rule, marginVertical: 14 },
  buyBtn: { height: 44, backgroundColor: C.ink, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  buyBtnLocked: { backgroundColor: C.boneDark },
  btnDisabled: { opacity: 0.5 },
  buyBtnText: { fontFamily: F.sansMed, fontSize: 11, color: C.cream, letterSpacing: 2, textTransform: 'uppercase' },
  note: { fontFamily: F.sansReg, fontSize: 11, color: C.lightGray, textAlign: 'center', marginTop: 8, letterSpacing: 0.2 },
})
