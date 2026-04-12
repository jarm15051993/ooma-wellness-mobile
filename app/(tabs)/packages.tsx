import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useStripe } from '@stripe/stripe-react-native'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { C, F } from '@/constants/theme'
import Toast from '@/components/Toast'
import BetaOverlay from '@/components/BetaOverlay'

type Package = {
  id: string
  name: string
  description: string | null
  classCount: number
  price: number
  durationDays: number
  isStudentPackage: boolean
  isPurchasable: boolean
  packageType: 'REFORMER' | 'YOGA' | 'BOTH'
  isUnlimited: boolean
}

export default function PackagesScreen() {
  const { t } = useTranslation()
  const { refreshUser, isBeta } = useAuth()
  const { initPaymentSheet, presentPaymentSheet } = useStripe()
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [toast, setToast] = useState({ visible: false, message: '' })

  async function fetchPackages() {
    try {
      const { data } = await api.get('/api/mobile/packages')
      // Only show packages this student can actually buy
      setPackages((data.packages as Package[]).filter(p => p.isPurchasable))
    } catch (err: any) {
      if (err.response?.status !== 401) {
        Alert.alert(t('common.error'), t('packages.errorLoad'))
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      fetchPackages()
    }, [])
  )

  async function handlePurchase(pkg: Package) {
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
        if (presentError.code !== 'Canceled') {
          Alert.alert(t('packages.paymentFailed'), presentError.message)
        }
        return
      }

      const paymentIntentId = data.clientSecret.split('_secret_')[0]
      await new Promise(resolve => setTimeout(resolve, 1500))
      await api.post('/api/mobile/payment-confirm', { paymentIntentId })
      await refreshUser()
      setToast({ visible: true, message: t('packages.paymentSuccess') })
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? t('common.somethingWentWrong')
      Alert.alert(t('common.error'), msg)
    } finally {
      setLoadingId(null)
    }
  }

  const studentPackages = packages.filter(p => p.isStudentPackage)
  const regularPackages = packages.filter(p => !p.isStudentPackage)

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={C.burg} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.content, packages.length === 0 && styles.emptyContainer]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchPackages() }}
            tintColor={C.burg}
          />
        }
      >
        <View style={styles.headingRow}>
          <Text style={styles.headingItalic}>{t('packages.screenHeading')}</Text>
        </View>

        {packages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{t('packages.emptyState')}</Text>
          </View>
        ) : (
          <>
            {studentPackages.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>{t('packages.studentSection')}</Text>
                {studentPackages.map(pkg => (
                  <PackageCard
                    key={pkg.id}
                    pkg={pkg}
                    loadingId={loadingId}
                    onPress={() => handlePurchase(pkg)}
                    t={t}
                  />
                ))}
              </>
            )}

            {regularPackages.length > 0 && (
              <>
                {studentPackages.length > 0 && (
                  <Text style={styles.sectionTitle}>{t('packages.standardSection')}</Text>
                )}
                {regularPackages.map(pkg => (
                  <PackageCard
                    key={pkg.id}
                    pkg={pkg}
                    loadingId={loadingId}
                    onPress={() => handlePurchase(pkg)}
                    t={t}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      <Toast
        message={toast.message}
        visible={toast.visible}
        onHide={() => setToast(prev => ({ ...prev, visible: false }))}
      />

      {isBeta && <BetaOverlay />}
    </SafeAreaView>
  )
}

function PackageCard({
  pkg,
  loadingId,
  onPress,
  t,
}: {
  pkg: Package
  loadingId: string | null
  onPress: () => void
  t: (key: string, opts?: any) => string
}) {
  const isLoading = loadingId === pkg.id
  const isDisabled = loadingId !== null
  const perClass = (pkg.price / pkg.classCount).toFixed(0)

  const typeLabel = pkg.packageType === 'REFORMER'
    ? t('packages.typeReformer')
    : pkg.packageType === 'YOGA'
    ? t('packages.typeYoga')
    : t('packages.typeBoth')

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.packageName}>{pkg.name}</Text>
        <Text style={styles.packagePrice}>€{pkg.price}</Text>
      </View>
      {pkg.description ? (
        <Text style={styles.packageDesc}>{pkg.description}</Text>
      ) : null}
      <View style={styles.typeBadgeRow}>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{typeLabel.toUpperCase()}</Text>
        </View>
        {pkg.isUnlimited && (
          <View style={[styles.typeBadge, styles.unlimitedBadge]}>
            <Text style={[styles.typeBadgeText, styles.unlimitedBadgeText]}>{t('packages.unlimitedBadge')}</Text>
          </View>
        )}
      </View>
      {!pkg.isUnlimited && (
        <Text style={styles.classCount}>
          {pkg.classCount === 1
            ? t('packages.classCount_one', { count: 1 })
            : t('packages.classCount_other', { count: pkg.classCount })}
        </Text>
      )}
      {!pkg.isUnlimited && pkg.classCount > 1 && (
        <Text style={styles.perClass}>€{perClass} {t('packages.perClass')}</Text>
      )}
      <View style={styles.divider} />
      <TouchableOpacity
        style={[styles.buyBtn, isDisabled && styles.buyBtnDisabled]}
        onPress={onPress}
        disabled={isDisabled}
      >
        {isLoading
          ? <ActivityIndicator size="small" color={C.cream} />
          : <Text style={styles.buyBtnText}>{t('packages.buyButton')}</Text>
        }
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.cream },
  centered: { flex: 1, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 },
  emptyContainer: { flexGrow: 1 },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 24,
    marginTop: 8,
  },
  headingRegular: { fontFamily: F.serifReg, fontSize: 32, color: C.ink },
  headingItalic: { fontFamily: F.serif, fontSize: 32, color: C.burg },
  sectionTitle: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.midGray,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 8,
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontFamily: F.serifReg, fontSize: 18, color: C.midGray, textAlign: 'center', lineHeight: 26 },
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
  packageName: { fontFamily: F.serifBold, fontSize: 22, color: C.ink, flex: 1 },
  packagePrice: { fontFamily: F.serifBold, fontSize: 28, color: C.burg },
  packageDesc: { fontFamily: F.sansReg, fontSize: 12, color: C.midGray, marginBottom: 4 },
  typeBadgeRow: { flexDirection: 'row', gap: 6, marginBottom: 6, marginTop: 2 },
  typeBadge: {
    backgroundColor: C.burgPale,
    borderRadius: 2,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  typeBadgeText: { fontFamily: F.sansMed, fontSize: 9, color: C.burg, letterSpacing: 0.8 },
  unlimitedBadge: { backgroundColor: '#DCFCE7' },
  unlimitedBadgeText: { color: '#15803D' },
  classCount: { fontFamily: F.sansMed, fontSize: 12, color: C.ink, marginTop: 2 },
  perClass: { fontFamily: F.sansMed, fontSize: 11, color: C.green, letterSpacing: 0.3, marginTop: 2 },
  divider: { height: 1, backgroundColor: C.rule, marginVertical: 14 },
  buyBtn: {
    height: 44,
    backgroundColor: C.ink,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyBtnDisabled: { opacity: 0.5 },
  buyBtnText: { fontFamily: F.sansMed, fontSize: 11, color: C.cream, letterSpacing: 2, textTransform: 'uppercase' },
})
