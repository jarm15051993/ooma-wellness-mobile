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

type SectionKey = 'REFORMER' | 'YOGA' | 'BOTH'

const SPECIAL_BG = '#F7F1E4'
const SPECIAL_BORDER = '#C9A96A'
const SPECIAL_BADGE_BG = '#EDD9A3'
const SPECIAL_BADGE_TEXT = '#7A5C1E'

export default function PackagesScreen() {
  const { t } = useTranslation()
  const { refreshUser, isBeta } = useAuth()
  const { initPaymentSheet, presentPaymentSheet } = useStripe()
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [toast, setToast] = useState({ visible: false, message: '' })
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    REFORMER: true,
    YOGA: true,
    BOTH: true,
  })

  async function fetchPackages() {
    try {
      const { data } = await api.get('/api/mobile/packages')
      setPackages(data.packages as Package[])
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

  function toggleSection(key: SectionKey) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const reformerPkgs = packages.filter(p => p.packageType === 'REFORMER' && p.isPurchasable)
  const yogaPkgs     = packages.filter(p => p.packageType === 'YOGA' && p.isPurchasable)
  const bothPkgs     = packages.filter(p => p.packageType === 'BOTH' && p.isPurchasable && !p.isStudentPackage)
  const studentPkgs  = packages.filter(p => p.isPurchasable && p.isStudentPackage)

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
        contentContainerStyle={styles.content}
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

        <Section
          title={t('packages.sectionReformer')}
          expanded={expanded.REFORMER}
          onToggle={() => toggleSection('REFORMER')}
        >
          {reformerPkgs.map(pkg => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              loadingId={loadingId}
              onPress={() => handlePurchase(pkg)}
              t={t}
            />
          ))}
        </Section>

        <Section
          title={t('packages.sectionYoga')}
          expanded={expanded.YOGA}
          onToggle={() => toggleSection('YOGA')}
        >
          {yogaPkgs.map(pkg => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              loadingId={loadingId}
              onPress={() => handlePurchase(pkg)}
              t={t}
            />
          ))}
        </Section>

        <Section
          title={t('packages.sectionBoth')}
          expanded={expanded.BOTH}
          onToggle={() => toggleSection('BOTH')}
          special
        >
          {bothPkgs.map(pkg => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              loadingId={loadingId}
              onPress={() => handlePurchase(pkg)}
              t={t}
            />
          ))}
          {studentPkgs.length > 0 && (
            <>
              <View style={styles.studentDivider}>
                <View style={styles.studentDividerLine} />
                <Text style={styles.studentDividerLabel}>{t('packages.studentSection')}</Text>
                <View style={styles.studentDividerLine} />
              </View>
              {studentPkgs.map(pkg => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  loadingId={loadingId}
                  onPress={() => handlePurchase(pkg)}
                  t={t}
                  student
                />
              ))}
            </>
          )}
        </Section>
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

function Section({
  title,
  expanded,
  onToggle,
  special = false,
  children,
}: {
  title: string
  expanded: boolean
  onToggle: () => void
  special?: boolean
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <View style={[styles.section, special && styles.sectionSpecial]}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={styles.sectionTitleRow}>
          <Text style={[styles.sectionTitle, special && styles.sectionTitleSpecial]}>
            {title}
          </Text>
          {special && (
            <View style={styles.specialBadge}>
              <Text style={styles.specialBadgeText}>{t('packages.specialBadge')}</Text>
            </View>
          )}
        </View>
        <Text
          style={[
            styles.chevron,
            special && styles.chevronSpecial,
            { transform: [{ rotate: expanded ? '90deg' : '0deg' }] },
          ]}
        >
          ›
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.sectionBody}>{children}</View>
      )}
    </View>
  )
}

function PackageCard({
  pkg,
  loadingId,
  onPress,
  t,
  student = false,
}: {
  pkg: Package
  loadingId: string | null
  onPress: () => void
  t: (key: string, opts?: any) => string
  student?: boolean
}) {
  const isLoading = loadingId === pkg.id
  const isDisabled = loadingId !== null
  const perClass = pkg.isUnlimited ? null : (pkg.price / pkg.classCount).toFixed(0)

  return (
    <View style={[styles.card, student && styles.cardStudent]}>
      <View style={styles.cardRow}>
        <View style={styles.cardInfo}>
          <Text style={styles.packageName}>{pkg.name}</Text>
          <Text style={styles.classInfo}>
            {pkg.isUnlimited
              ? t('packages.unlimitedClasses')
              : t('packages.classesPerMonth', { count: pkg.classCount })}
          </Text>
          {pkg.isUnlimited ? (
            <Text style={styles.infinityText}>∞</Text>
          ) : (
            <Text style={styles.perClassText}>
              €{perClass} / {t('packages.perClass')}
            </Text>
          )}
        </View>
        <Text style={[styles.packagePrice, student && styles.packagePriceStudent]}>
          €{pkg.price}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.buyBtn, student && styles.buyBtnStudent, isDisabled && styles.buyBtnDisabled]}
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
  content: { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 8 },

  headingRow: { marginBottom: 24, marginTop: 8 },
  headingItalic: { fontFamily: F.serif, fontSize: 32, color: C.burg },

  // ── Sections ──────────────────────────────────────────────────────────────
  section: {
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    marginBottom: 16,
    overflow: 'hidden',
    backgroundColor: C.warmWhite,
  },
  sectionSpecial: {
    borderColor: SPECIAL_BORDER,
    backgroundColor: SPECIAL_BG,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  sectionTitle: {
    fontFamily: F.serifBold,
    fontSize: 20,
    color: C.ink,
  },
  sectionTitleSpecial: {
    color: SPECIAL_BADGE_TEXT,
  },
  specialBadge: {
    backgroundColor: SPECIAL_BADGE_BG,
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  specialBadgeText: {
    fontFamily: F.sansMed,
    fontSize: 9,
    color: SPECIAL_BADGE_TEXT,
    letterSpacing: 1.2,
  },
  chevron: {
    fontFamily: F.sansReg,
    fontSize: 20,
    color: C.midGray,
  },
  chevronSpecial: {
    color: SPECIAL_BADGE_TEXT,
  },
  sectionBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: C.rule,
  },

  // ── Cards ─────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: C.cream,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    padding: 16,
    marginTop: 10,
  },
  cardStudent: {
    backgroundColor: '#F0FAF4',
    borderColor: '#A7D7B8',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardInfo: {
    flex: 1,
    paddingRight: 12,
  },
  packageName: {
    fontFamily: F.serifBold,
    fontSize: 17,
    color: C.ink,
    marginBottom: 4,
  },
  classInfo: {
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.midGray,
    marginBottom: 4,
  },
  perClassText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.green,
    letterSpacing: 0.3,
  },
  infinityText: {
    fontFamily: F.serifReg,
    fontSize: 20,
    color: C.burg,
    lineHeight: 24,
  },
  packagePrice: {
    fontFamily: F.serifBold,
    fontSize: 26,
    color: C.burg,
  },
  packagePriceStudent: {
    color: '#2D7A4F',
  },

  buyBtn: {
    height: 42,
    backgroundColor: C.ink,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyBtnStudent: {
    backgroundColor: '#2D7A4F',
  },
  buyBtnDisabled: { opacity: 0.5 },
  buyBtnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.cream,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // ── Student subsection ────────────────────────────────────────────────────
  studentDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    marginBottom: 2,
  },
  studentDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#A7D7B8',
  },
  studentDividerLabel: {
    fontFamily: F.sansMed,
    fontSize: 9,
    color: '#2D7A4F',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
})
