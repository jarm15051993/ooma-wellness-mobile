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
  Linking,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useStripe } from '@stripe/stripe-react-native'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { subscriptionsApi, isGrandfathered, pollForSubscriptionCredit } from '@/lib/subscriptions'
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

type SectionKey = 'REFORMER' | 'YOGA' | 'BOTH' | 'PERSONAL'

const SPECIAL_BG = '#F0E8D8'
const SPECIAL_BORDER = '#C8A96A'
const SPECIAL_BADGE_BG = '#DFC9A8'
const SPECIAL_BADGE_TEXT = '#8A6035'

export default function PackagesScreen() {
  const { t } = useTranslation()
  const { user, settings, refreshUser, isBeta } = useAuth()
  const { initPaymentSheet, presentPaymentSheet } = useStripe()
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [joiningClub, setJoiningClub] = useState(false)
  const [toast, setToast] = useState({ visible: false, message: '' })
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    REFORMER: false,
    YOGA: false,
    BOTH: false,
    PERSONAL: false,
  })

  const showMembershipGate =
    settings?.subscriptionPaymentRequired === true &&
    !user?.isClubMember &&
    !isGrandfathered(user?.createdAt, settings?.membershipRequiredSince)

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

  async function handleSubscribe(pkg: Package) {
    setLoadingId(pkg.id)
    try {
      const { data } = await subscriptionsApi.subscribe(pkg.id)

      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: data.clientSecret,
        merchantDisplayName: 'OOMA Wellness',
        returnURL: 'ooma://stripe-redirect',
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

      // Poll until the webhook fires and the first credit is created
      await pollForSubscriptionCredit(data.subscription.id)
      await refreshUser()
      setToast({ visible: true, message: t('packages.subscribeSuccess') })
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? t('common.somethingWentWrong')
      Alert.alert(t('common.error'), msg)
    } finally {
      setLoadingId(null)
    }
  }

  async function handleJoinClub() {
    setJoiningClub(true)
    try {
      console.log('[JoinClub] 1. Calling joinClub API...')
      const { data } = await subscriptionsApi.joinClub()
      console.log('[JoinClub] 2. Got clientSecret:', data.clientSecret?.slice(0, 20), '...')

      console.log('[JoinClub] 3. Calling initPaymentSheet...')
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: data.clientSecret,
        merchantDisplayName: 'OOMA Wellness',
        returnURL: 'ooma://stripe-redirect',
        style: 'alwaysLight',
      })
      console.log('[JoinClub] 4. initPaymentSheet done, error:', initError)
      if (initError) throw new Error(initError.message)

      console.log('[JoinClub] 5. Calling presentPaymentSheet...')
      const { error: presentError } = await presentPaymentSheet()
      console.log('[JoinClub] 6. presentPaymentSheet done, error:', presentError)
      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert(t('packages.paymentFailed'), presentError.message)
        }
        return
      }

      const paymentIntentId = data.clientSecret.split('_secret_')[0]
      console.log('[JoinClub] 7. Confirming join club, PI:', paymentIntentId)
      await subscriptionsApi.confirmJoinClub(paymentIntentId)
      await refreshUser()
      setToast({ visible: true, message: t('packages.joinClubSuccess') })
    } catch (err: any) {
      console.log('[JoinClub] ERROR:', err?.response?.status, err?.response?.data, err?.message)
      const msg = err?.response?.data?.error ?? err?.message ?? t('common.somethingWentWrong')
      Alert.alert(t('common.error'), msg)
    } finally {
      setJoiningClub(false)
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

  if (showMembershipGate) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.headingRow}>
          <Text style={styles.headingItalic}>{t('packages.screenHeading')}</Text>
        </View>
        <View style={styles.membershipGateContainer}>
          <MembershipCard
            price={settings?.subscriptionPrice ?? 0}
            loading={joiningClub}
            onJoin={handleJoinClub}
            t={t}
          />
        </View>
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
              gated={false}
              onPress={() => handleSubscribe(pkg)}
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
              gated={false}
              onPress={() => handleSubscribe(pkg)}
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
              gated={false}
              onPress={() => handleSubscribe(pkg)}
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
                  gated={false}
                  onPress={() => handleSubscribe(pkg)}
                  t={t}
                  student
                />
              ))}
            </>
          )}
        </Section>

        <PersonalSection
          expanded={expanded.PERSONAL}
          onToggle={() => toggleSection('PERSONAL')}
        />
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

function MembershipCard({
  price,
  loading,
  onJoin,
  t,
}: {
  price: number
  loading: boolean
  onJoin: () => void
  t: (key: string, opts?: any) => string
}) {
  return (
    <View style={styles.membershipCard}>
      <Text style={styles.membershipCardLogo}>OOMA</Text>
      <Text style={styles.membershipCardClub}>WELLNESS CLUB</Text>
      <View style={styles.membershipCardDivider} />
      <Text style={styles.membershipCardTitle}>{t('packages.membershipBannerTitle')}</Text>
      <Text style={styles.membershipCardBody}>
        {t('packages.membershipBannerBody', { price: `€${price}` })}
      </Text>
      <TouchableOpacity
        style={[styles.membershipCardBtn, loading && styles.buyBtnDisabled]}
        onPress={onJoin}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading
          ? <ActivityIndicator size="small" color={C.cream} />
          : <Text style={styles.membershipCardBtnText}>{t('packages.joinClubButton')}</Text>
        }
      </TouchableOpacity>
    </View>
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

function PersonalSection({
  expanded,
  onToggle,
}: {
  expanded: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  return (
    <View style={styles.sectionPersonal}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitlePersonal}>
            {t('packages.sectionPersonal')}
          </Text>
          <View style={styles.personalBadge}>
            <Text style={styles.personalBadgeText}>{t('packages.personalBadge')}</Text>
          </View>
        </View>
        <Text
          style={[
            styles.chevron,
            styles.chevronPersonal,
            { transform: [{ rotate: expanded ? '90deg' : '0deg' }] },
          ]}
        >
          ›
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View style={[styles.sectionBody, styles.sectionBodyPersonal]}>
          <Text style={styles.personalDescription}>{t('packages.personalDescription')}</Text>
          <TouchableOpacity
            style={styles.personalCTABtn}
            onPress={() => Linking.openURL('https://wa.me/34744432128?text=Me%20interest%20class%20personalizadas')}
            activeOpacity={0.8}
          >
            <Text style={styles.personalCTAText}>{t('packages.personalCTA')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

function PackageCard({
  pkg,
  loadingId,
  gated,
  onPress,
  t,
  student = false,
}: {
  pkg: Package
  loadingId: string | null
  gated: boolean
  onPress: () => void
  t: (key: string, opts?: any) => string
  student?: boolean
}) {
  const isLoading = loadingId === pkg.id
  const isDisabled = loadingId !== null || gated
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
        <View style={styles.priceBlock}>
          <Text style={[styles.packagePrice, student && styles.packagePriceStudent]}>
            €{pkg.price}
          </Text>
          <Text style={[styles.perMonth, student && styles.perMonthStudent]}>
            / {t('packages.perMonth')}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.buyBtn, student && styles.buyBtnStudent, isDisabled && styles.buyBtnDisabled]}
        onPress={onPress}
        disabled={isDisabled}
      >
        {isLoading
          ? <ActivityIndicator size="small" color={C.cream} />
          : <Text style={styles.buyBtnText}>{t('packages.subscribeButton')}</Text>
        }
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.cream },
  centered: { flex: 1, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 8 },

  headingRow: { marginBottom: 24, marginTop: 8, paddingHorizontal: 20 },
  headingItalic: { fontFamily: F.serif, fontSize: 32, color: C.burg },

  // ── Membership gate (full-screen card) ───────────────────────────────────
  membershipGateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 48,
  },
  membershipCard: {
    backgroundColor: C.ink,
    borderRadius: 6,
    paddingHorizontal: 32,
    paddingVertical: 40,
    alignItems: 'center',
    width: '100%',
  },
  membershipCardLogo: {
    fontFamily: F.serifBold,
    fontSize: 36,
    color: C.cream,
    letterSpacing: 8,
    marginBottom: 4,
  },
  membershipCardClub: {
    fontFamily: F.sansMed,
    fontSize: 10,
    color: C.cream,
    letterSpacing: 4,
    opacity: 0.6,
    marginBottom: 24,
  },
  membershipCardDivider: {
    width: '100%',
    height: 1,
    backgroundColor: C.cream,
    opacity: 0.15,
    marginBottom: 28,
  },
  membershipCardTitle: {
    fontFamily: F.serifBold,
    fontSize: 22,
    color: C.cream,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 30,
  },
  membershipCardBody: {
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.cream,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    opacity: 0.8,
  },
  membershipCardBtn: {
    height: 50,
    backgroundColor: C.burg,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  membershipCardBtnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.cream,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },

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
    backgroundColor: '#EBF0EA',
    borderColor: '#9BAA96',
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
  priceBlock: {
    alignItems: 'flex-end',
  },
  packagePrice: {
    fontFamily: F.serifBold,
    fontSize: 26,
    color: C.burg,
  },
  packagePriceStudent: {
    color: '#6E7B6A',
  },
  perMonth: {
    fontFamily: F.sansReg,
    fontSize: 11,
    color: C.midGray,
    marginTop: -2,
  },
  perMonthStudent: {
    color: '#6E7B6A',
  },

  buyBtn: {
    height: 42,
    backgroundColor: C.ink,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyBtnStudent: {
    backgroundColor: '#6E7B6A',
  },
  buyBtnDisabled: { opacity: 0.5 },
  buyBtnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.cream,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // ── Personal section ──────────────────────────────────────────────────────
  sectionPersonal: {
    borderWidth: 1,
    borderColor: C.burg,
    borderRadius: 4,
    marginBottom: 16,
    overflow: 'hidden',
    backgroundColor: C.burgPale,
  },
  sectionTitlePersonal: {
    fontFamily: F.serifBold,
    fontSize: 20,
    color: C.burg,
  },
  sectionBodyPersonal: {
    borderTopColor: C.burg,
  },
  chevronPersonal: {
    color: C.burg,
  },
  personalBadge: {
    backgroundColor: C.burg,
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  personalBadgeText: {
    fontFamily: F.sansMed,
    fontSize: 9,
    color: C.cream,
    letterSpacing: 1.2,
  },
  personalDescription: {
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.ink,
    lineHeight: 21,
    marginBottom: 16,
  },
  personalCTABtn: {
    height: 44,
    backgroundColor: C.burg,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personalCTAText: {
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
    backgroundColor: '#9BAA96',
  },
  studentDividerLabel: {
    fontFamily: F.sansMed,
    fontSize: 9,
    color: '#6E7B6A',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
})
