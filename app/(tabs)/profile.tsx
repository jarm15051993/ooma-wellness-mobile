import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Platform,
  Linking,
  Modal,
  Switch,
  TextInput,
} from 'react-native'
import { format } from 'date-fns'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as SecureStore from 'expo-secure-store'
import * as Sharing from 'expo-sharing'
import * as IntentLauncher from 'expo-intent-launcher'
import QRCode from 'react-native-qrcode-svg'
import { useStripe } from '@stripe/stripe-react-native'
import { api } from '@/lib/api'
import { useAuth, type Subscription, type StandaloneCredit } from '@/contexts/AuthContext'
import { subscriptionsApi } from '@/lib/subscriptions'
import { C, F } from '@/constants/theme'
import { API_BASE_URL } from '@/constants/api'
import WalletModal from '@/components/WalletModal'
import GoalSelector from '@/components/GoalSelector'
import WelcomeGiftModal from '@/components/WelcomeGiftModal'
import { consumePendingGift } from '@/lib/pendingGift'
import Toast from '@/components/Toast'
import { consumePendingWalletToast } from '@/lib/pendingToast'
import { CONDITIONS } from '@/constants/onboarding'
import { useTranslation } from 'react-i18next'
import { LANGUAGES, type AppLanguage } from '@/lib/i18n'

type NotifType = 'booking_confirmation' | 'booking_cancellation' | 'package_purchase'
type NotifPrefs = Record<NotifType, boolean>


type ExtendedProfile = {
  birthday: string | null
  goals: string | null
  userGoalIds: string[]
  additionalInfo: string | null
}

function parseConditions(additionalInfo: string | null): { selected: string[]; other: string } {
  if (!additionalInfo) return { selected: [], other: '' }
  const parts = additionalInfo.split(', ')
  const selected: string[] = []
  let other = ''
  for (const part of parts) {
    if (part.startsWith('Other: ')) {
      selected.push('Other')
      other = part.slice(7)
    } else if ((CONDITIONS as readonly string[]).includes(part)) {
      selected.push(part)
    }
  }
  return { selected, other }
}

function serializeConditions(selected: string[], other: string): string | null {
  const parts = selected.filter(c => c !== 'Other')
  if (selected.includes('Other') && other.trim()) parts.push(`Other: ${other.trim()}`)
  return parts.join(', ') || null
}

function getSingleClassStatus(credit: import('@/contexts/AuthContext').StandaloneCredit): 'active' | 'booked' | 'attended' | 'expired' {
  if (credit.expiresAt && new Date(credit.expiresAt) < new Date() && credit.creditsRemaining > 0) return 'expired'
  const booking = credit.bookings?.[0]
  if (booking) return booking.attendedAt ? 'attended' : 'booked'
  return 'active'
}

function PackageCard({ pkg, muted }: { pkg: UserPackage; muted: boolean }) {
  const { t } = useTranslation()

  let expiryLabel: string
  if (muted) {
    if (pkg.expiredReason === 'classes_used') {
      expiryLabel = 'All classes were used'
    } else if (pkg.expiresAt) {
      expiryLabel = `Expired on ${format(new Date(pkg.expiresAt), 'MMM d, yyyy')}`
    } else {
      expiryLabel = 'Expired'
    }
  } else {
    expiryLabel = pkg.expiresAt
      ? `Expires ${format(new Date(pkg.expiresAt), 'MMM d, yyyy')}`
      : 'No expiry'
  }
  const progress = pkg.classesTotal > 0 ? pkg.classesRemaining / pkg.classesTotal : 0

  const typeLabel = pkg.packageType === 'REFORMER'
    ? t('classes.typeReformer')
    : pkg.packageType === 'YOGA'
    ? t('classes.typeYoga')
    : pkg.packageType === 'BOTH'
    ? `${t('classes.typeReformer')} + ${t('classes.typeYoga')}`
    : null

  return (
    <View style={[styles.packageCard, muted && styles.packageCardMuted]}>
      <View style={styles.packageCardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.packageName, muted && styles.mutedText]}>{pkg.name}</Text>
          {typeLabel ? (
            <Text style={[styles.packageTypeLabel, muted && styles.mutedText]}>{typeLabel}</Text>
          ) : null}
        </View>
        <Text style={[styles.packageCount, muted && styles.mutedText]}>
          {pkg.classesRemaining} of {pkg.classesTotal}
        </Text>
      </View>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` as any }, muted && styles.progressFillMuted]} />
      </View>
      <Text style={[styles.packageExpiry, muted && styles.mutedText]}>{expiryLabel}</Text>
    </View>
  )
}

type UserPackage = {
  id: string
  name: string
  classesTotal: number
  classesRemaining: number
  purchasedAt: string
  expiresAt: string | null
  expiredReason?: 'classes_used' | 'date_expired'
  packageType?: 'REFORMER' | 'YOGA' | 'BOTH'
}

// Simple read-only info row
function InfoRow({ label, value, trailing }: { label: string; value: string | null | undefined; trailing?: React.ReactNode }) {
  return (
    <View style={styles.infoRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value ?? '—'}</Text>
      </View>
      {trailing}
    </View>
  )
}

export default function ProfileScreen() {
  const { t } = useTranslation()

  const NOTIF_LABELS: Record<NotifType, string> = {
    booking_confirmation: t('profile.notifications.classBooked'),
    booking_cancellation: t('profile.notifications.bookingCancelled'),
    package_purchase: t('profile.notifications.packagePurchase'),
  }
  const router = useRouter()
  const { user, signOut, refreshUser, tenantUser, exitTenantSession, isAdmin, isOwner, canMarkAsStudent, canGiftClasses, isBeta, language, setLanguage } = useAuth()
  const displayUser = tenantUser ?? user
  const isStaff = isAdmin || isOwner
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [standaloneCredits, setStandaloneCredits] = useState<StandaloneCredit[]>([])
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(true)
  const [cancelTarget, setCancelTarget] = useState<Subscription | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoVersion, setPhotoVersion] = useState(Date.now())
  const [qrCode, setQrCode] = useState<string | null>(user?.qrCode ?? null)
  const [walletLoading, setWalletLoading] = useState(false)
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [showWalletSuccessModal, setShowWalletSuccessModal] = useState(false)
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({
    booking_confirmation: true,
    booking_cancellation: true,
    package_purchase: true,
  })
  const [savingNotif, setSavingNotif] = useState<NotifType | null>(null)
  const [notifToast, setNotifToast] = useState({ visible: false, message: '', isError: false })

  // Payment method
  const { initPaymentSheet, presentPaymentSheet } = useStripe()
  type CardInfo = { brand: string; last4: string; expMonth: number; expYear: number } | null
  const [card, setCard] = useState<CardInfo>(null)
  const [loadingCard, setLoadingCard] = useState(false)
  const [updatingCard, setUpdatingCard] = useState(false)

  // Student toggle (tenant mode only)
  const [studentStatus, setStudentStatus] = useState(false)
  const [savingStudent, setSavingStudent] = useState(false)

  // Gift classes (tenant mode only)
  const [showGiftClassModal, setShowGiftClassModal] = useState(false)
  const [giftClassPackages, setGiftClassPackages] = useState<{ id: string; name: string; packageType: string; classCount: number }[]>([])
  const [loadingGiftClassPackages, setLoadingGiftClassPackages] = useState(false)
  const [selectedGiftClassPackage, setSelectedGiftClassPackage] = useState<string | null>(null)
  const [giftingClass, setGiftingClass] = useState(false)

  // Extended profile state
  const [extProfile, setExtProfile] = useState<ExtendedProfile>({ birthday: null, goals: null, userGoalIds: [], additionalInfo: null })

  // ─── Global edit modal ──────────────────────────────────────────────────────
  const [showEditModal, setShowEditModal] = useState(false)
  const [editName, setEditName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editDob, setEditDob] = useState('')
  const [editDobDate, setEditDobDate] = useState(new Date())
  const [editGoalIds, setEditGoalIds] = useState<string[]>([])
  const [showDobPicker, setShowDobPicker] = useState(false)
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Medical conditions modal
  const [showConditionsModal, setShowConditionsModal] = useState(false)
  const [condFromEdit, setCondFromEdit] = useState(false) // whether opened from edit modal
  const [condHasConditions, setCondHasConditions] = useState<boolean | null>(null)
  const [condSelected, setCondSelected] = useState<string[]>([])
  const [condOther, setCondOther] = useState('')
  const [savingConditions, setSavingConditions] = useState(false)
  const [condError, setCondError] = useState('')

  // Email change modal
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailStep, setEmailStep] = useState<1 | 2 | 3>(1)
  const [emailPassword, setEmailPassword] = useState('')
  const [emailPasswordError, setEmailPasswordError] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newEmailError, setNewEmailError] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)

  // Welcome gift modal
  const [showGiftModal, setShowGiftModal] = useState(false)
  const [claimingGift, setClaimingGift] = useState(false)

  // Language modal
  const [showLanguageModal, setShowLanguageModal] = useState(false)
  const [savingLanguage, setSavingLanguage] = useState(false)

  // Account deletion
  const [deletionPreview, setDeletionPreview] = useState<{
    activeSubscriptions: { id: string; name: string }[]
    upcomingBookingsCount: number
    totalCreditsRemaining: number
    hasUnlimited: boolean
  } | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [loadingDeletePreview, setLoadingDeletePreview] = useState(false)


  useFocusEffect(
    useCallback(() => {
      if (isStaff && !tenantUser) return
      setLoadingSubscriptions(true)
      subscriptionsApi.list()
        .then(({ data }) => {
          setSubscriptions(data.subscriptions ?? [])
          setStandaloneCredits(data.standaloneCredits ?? [])
        })
        .catch(() => {})
        .finally(() => setLoadingSubscriptions(false))
    }, [isStaff, tenantUser])
  )

  function fetchCard() {
    setLoadingCard(true)
    api.get('/api/mobile/payment-method')
      .then(({ data }) => setCard(data.card ?? null))
      .catch(() => {})
      .finally(() => setLoadingCard(false))
  }

  useFocusEffect(
    useCallback(() => {
      if (isStaff && !tenantUser) return
      fetchCard()
    }, [isStaff, tenantUser])
  )

  useFocusEffect(
    useCallback(() => {
      if (isStaff) return
      api.get('/api/user/profile')
        .then(({ data }) => {
          setExtProfile({
            birthday: data.user.birthday ?? null,
            goals: data.user.goals ?? null,
            userGoalIds: data.user.userGoalIds ?? [],
            additionalInfo: data.user.additionalInfo ?? null,
          })
        })
        .catch(() => {})
    }, [isStaff])
  )

  useFocusEffect(
    useCallback(() => {
      if (consumePendingWalletToast()) setShowWalletSuccessModal(true)
    }, [])
  )

  useFocusEffect(
    useCallback(() => {
      if (isStaff && !tenantUser) return
      api.get('/api/mobile/notification-preferences')
        .then(({ data }) => {
          const prefs = { ...notifPrefs }
          for (const p of data.preferences) prefs[p.type as NotifType] = p.enabled
          setNotifPrefs(prefs)
        })
        .catch(() => {})
    }, [isStaff, tenantUser])
  )

  useFocusEffect(
    useCallback(() => {
      if (!user?.qrCode) {
        api.post('/api/user/generate-qr')
          .then(({ data }) => setQrCode(data.qrCode))
          .catch(() => {})
      } else {
        setQrCode(user.qrCode)
      }
    }, [user?.qrCode])
  )

  useFocusEffect(
    useCallback(() => {
      if (isStaff || !user?.id) return
      if (consumePendingGift()) {
        setShowGiftModal(true)
        return
      }
    }, [isStaff, user?.id])
  )

  // Sync student status when entering a tenant session
  React.useEffect(() => {
    if (!tenantUser) return
    api.get(`/api/admin/users/${tenantUser.id}/mark-as-student`)
      .then(({ data }) => setStudentStatus(data.isStudent))
      .catch(() => {})
  }, [tenantUser?.id])

  async function toggleStudentStatus(value: boolean) {
    if (!tenantUser) return
    const previous = studentStatus
    setStudentStatus(value) // optimistic
    setSavingStudent(true)
    try {
      await api.patch(`/api/admin/users/${tenantUser.id}/mark-as-student`, { isStudent: value })
      setNotifToast({ visible: true, message: value ? 'Marked as Student' : 'No longer a Student', isError: false })
    } catch {
      setStudentStatus(previous) // revert
      setNotifToast({ visible: true, message: 'Could not update student status. Please try again.', isError: true })
    } finally {
      setSavingStudent(false)
    }
  }

  async function openGiftClassModal() {
    setSelectedGiftClassPackage(null)
    setShowGiftClassModal(true)
    setLoadingGiftClassPackages(true)
    try {
      const { data } = await api.get('/api/mobile/packages')
      const oneTime = (data.packages as any[]).filter((p: any) => !p.isRecurring)
      setGiftClassPackages(oneTime.map((p: any) => ({ id: p.id, name: p.name, packageType: p.packageType, classCount: p.classCount })))
    } catch {
      setShowGiftClassModal(false)
    } finally {
      setLoadingGiftClassPackages(false)
    }
  }

  async function handleGiftClass() {
    if (!tenantUser || !selectedGiftClassPackage) return
    setGiftingClass(true)
    try {
      await api.post('/api/admin/gift-package', { userId: tenantUser.id, packageId: selectedGiftClassPackage })
      setShowGiftClassModal(false)
      setSelectedGiftClassPackage(null)
      setNotifToast({ visible: true, message: 'Class gifted successfully!', isError: false })
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Could not gift class. Please try again.'
      setNotifToast({ visible: true, message: msg, isError: true })
    } finally {
      setGiftingClass(false)
    }
  }

  async function handleCancelSubscription() {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await subscriptionsApi.cancel(cancelTarget.id)
      setCancelTarget(null)
      const { data } = await subscriptionsApi.list()
      setSubscriptions(data.subscriptions ?? [])
      setStandaloneCredits(data.standaloneCredits ?? [])
      setNotifToast({ visible: true, message: t('profile.subscriptions.cancelSuccess'), isError: false })
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? t('common.somethingWentWrong')
      Alert.alert(t('common.error'), msg)
    } finally {
      setCancelling(false)
    }
  }

  async function claimGift() {
    if (!user?.id) return
    setClaimingGift(true)
    try {
      const { data: claimData } = await api.post('/api/mobile/claim-welcome-gift')
      await SecureStore.setItemAsync(`gift_claimed_${user.id}`, 'true')
      // Immediately inject the new credit into state so the profile updates
      // without waiting for a full list refresh
      if (claimData?.userCredit) {
        const uc = claimData.userCredit
        setStandaloneCredits(prev => [
          ...prev,
          {
            id: uc.id,
            creditsRemaining: uc.creditsRemaining,
            creditsTotal: uc.creditsTotal ?? uc.creditsRemaining,
            isUnlimited: uc.isUnlimited,
            expiresAt: uc.expiresAt,
            stripePaymentId: uc.stripePaymentId ?? null,
            package: uc.package ?? null,
            bookings: [],
          },
        ])
      }
      setShowGiftModal(false)
      // Background refresh to sync full state
      subscriptionsApi.list()
        .then(({ data }) => {
          setSubscriptions(data.subscriptions ?? [])
          setStandaloneCredits(data.standaloneCredits ?? [])
        })
        .catch(() => {})
    } catch (err: any) {
      if (err.response?.status === 409) {
        // Already claimed — mark locally and refresh to show the existing credit
        await SecureStore.setItemAsync(`gift_claimed_${user.id}`, 'true')
        setShowGiftModal(false)
        subscriptionsApi.list()
          .then(({ data }) => {
            setSubscriptions(data.subscriptions ?? [])
            setStandaloneCredits(data.standaloneCredits ?? [])
          })
          .catch(() => {})
      } else {
        Alert.alert('Error', `Could not claim the gift. Status: ${err?.response?.status} — ${err?.response?.data?.error ?? err?.message}`)
      }
    } finally {
      setClaimingGift(false)
    }
  }

  // ─── Global edit modal helpers ──────────────────────────────────────────────

  function openEditModal() {
    setEditName(user?.name ?? '')
    setEditLastName(user?.lastName ?? '')
    setEditPhone(user?.phone ?? '')
    setEditGoalIds(extProfile.userGoalIds)
    const dob = extProfile.birthday ? new Date(extProfile.birthday) : new Date(2000, 0, 1)
    setEditDob(extProfile.birthday ?? '')
    setEditDobDate(dob)
    setEditError('')
    setShowDobPicker(false)
    setShowEditModal(true)
  }

  function validateEditForm(): string | null {
    if (!editName.trim()) return 'Please enter your first name.'
    if (!editLastName.trim()) return 'Please enter your last name.'
    const digits = editPhone.replace(/\D/g, '')
    if (digits.length < 7) return 'Please enter a valid phone number.'
    if (editGoalIds.length === 0) return 'Please select at least one goal.'
    return null
  }

  async function saveEditProfile() {
    const err = validateEditForm()
    if (err) { setEditError(err); return }

    setSavingEdit(true)
    setEditError('')
    try {
      await api.patch('/api/user/update', {
        userId: user!.id,
        name: editName.trim(),
        lastName: editLastName.trim(),
        phone: editPhone.trim(),
        goalIds: editGoalIds,
        ...(editDob ? { birthday: editDob } : {}),
      })

      setExtProfile(p => ({
        ...p,
        userGoalIds: editGoalIds,
        birthday: editDob || p.birthday,
      }))
      setShowEditModal(false)
      setNotifToast({ visible: true, message: 'Profile Updated', isError: false })
      refreshUser().catch(() => {})
    } catch (e: any) {
      setEditError(e?.response?.data?.error ?? 'Could not save. Please try again.')
    } finally {
      setSavingEdit(false)
    }
  }

  // ─── Medical conditions ──────────────────────────────────────────────────────

  function openConditionsModal(fromEdit = false) {
    const { selected, other } = parseConditions(extProfile.additionalInfo)
    setCondHasConditions(selected.length > 0 ? true : extProfile.additionalInfo === null ? null : false)
    setCondSelected(selected)
    setCondOther(other)
    setCondError('')
    setCondFromEdit(fromEdit)
    if (fromEdit) setShowEditModal(false)
    setShowConditionsModal(true)
  }

  function toggleCondition(c: string) {
    setCondSelected(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  }

  async function saveConditions() {
    if (condHasConditions === null) { setCondError('Please answer the health conditions question.'); return }
    if (condHasConditions && condSelected.length === 0) { setCondError('Please select at least one condition.'); return }
    if (condHasConditions && condSelected.includes('Other') && !condOther.trim()) { setCondError('Please describe your other condition.'); return }

    setSavingConditions(true)
    try {
      const additionalInfo = condHasConditions ? serializeConditions(condSelected, condOther) : null
      await api.patch('/api/user/update', { userId: user!.id, additionalInfo: additionalInfo ?? '' })
      setExtProfile(p => ({ ...p, additionalInfo }))
      setShowConditionsModal(false)
      if (condFromEdit) {
        setTimeout(() => setShowEditModal(true), 350)
      } else {
        setNotifToast({ visible: true, message: 'Profile Updated', isError: false })
      }
    } catch (e: any) {
      setCondError(e?.response?.data?.error ?? 'Could not save. Please try again.')
    } finally {
      setSavingConditions(false)
    }
  }

  // ─── Email change ────────────────────────────────────────────────────────────

  function openEmailModal() {
    setEmailStep(1)
    setEmailPassword('')
    setEmailPasswordError('')
    setNewEmail('')
    setNewEmailError('')
    setShowEmailModal(true)
  }

  async function handleVerifyPassword() {
    if (!emailPassword) { setEmailPasswordError('Please enter your password.'); return }
    setEmailLoading(true)
    try {
      await api.post('/api/user/verify-password', { password: emailPassword })
      setEmailStep(2)
      setEmailPasswordError('')
    } catch (e: any) {
      setEmailPasswordError(e?.response?.data?.error ?? 'Incorrect password. Please try again.')
    } finally {
      setEmailLoading(false)
    }
  }

  async function openMailApp() {
    try {
      if (Platform.OS === 'ios') {
        const supported = await Linking.canOpenURL('message://')
        if (supported) { await Linking.openURL('message://'); return }
      }
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MAIN, {
        category: 'android.intent.category.APP_EMAIL',
        flags: 0x10000000,
      })
    } catch {
      Alert.alert('No mail app found', 'Please open your email app manually and check your inbox.')
    }
  }

  async function handleRequestEmailChange() {
    if (!newEmail.trim()) { setNewEmailError('Please enter a new email address.'); return }
    setEmailLoading(true)
    try {
      await api.post('/api/user/request-email-change', { newEmail: newEmail.trim() })
      setEmailStep(3)
      setNewEmailError('')
    } catch (e: any) {
      setNewEmailError(e?.response?.data?.error ?? 'Could not send verification email. Please try again.')
    } finally {
      setEmailLoading(false)
    }
  }

  // ─── Notifications ────────────────────────────────────────────────────────────

  async function handleToggleNotif(type: NotifType, value: boolean) {
    const previous = notifPrefs[type]
    setNotifPrefs(p => ({ ...p, [type]: value }))
    setSavingNotif(type)
    try {
      await api.patch('/api/mobile/notification-preferences', { type, enabled: value })
      setNotifToast({ visible: true, message: 'Preferences Saved', isError: false })
    } catch {
      setNotifPrefs(p => ({ ...p, [type]: previous }))
      setNotifToast({ visible: true, message: 'Could not save preference. Please try again.', isError: true })
    } finally {
      setSavingNotif(null)
    }
  }

  // ─── Wallet / photo ──────────────────────────────────────────────────────────

  async function handleAddToAppleWallet() {
    setWalletLoading(true)
    try {
      const { data } = await api.post('/api/wallet/apple')
      await Linking.openURL(data.url)
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not generate your pass. Please try again.')
    } finally {
      setWalletLoading(false)
    }
  }

  async function handleAddToGoogleWallet() {
    setWalletLoading(true)
    try {
      const { data } = await api.get('/api/wallet/google')
      await Linking.openURL(data.saveUrl)
    } catch (e: any) {
      const serverMsg = e?.response?.data?.error
      const msg = serverMsg === 'Google Wallet not configured'
        ? 'Google Wallet is not available yet. Check back soon.'
        : (serverMsg ?? 'Could not generate your pass. Please try again.')
      Alert.alert('Error', msg)
    } finally {
      setWalletLoading(false)
    }
  }

  async function handleChangePhoto() {
    Alert.alert('Change Photo', 'Choose an option', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
          if (status !== 'granted') {
            Alert.alert('Permission required', 'Please allow access to your photo library.')
            return
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          })
          if (!result.canceled) await uploadPhoto(result.assets[0])
        },
      },
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync()
          if (status !== 'granted') {
            Alert.alert('Permission required', 'Please allow access to your camera.')
            return
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          })
          if (!result.canceled) await uploadPhoto(result.assets[0])
        },
      },
    ])
  }

  async function uploadPhoto(asset: ImagePicker.ImagePickerAsset) {
    if (!user?.id) return
    setUploadingPhoto(true)
    try {
      const formData = new FormData()
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName ?? 'photo.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      } as any)
      formData.append('userId', user.id)
      await api.post('/api/user/profile-picture', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      await refreshUser()
      setPhotoVersion(Date.now())
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error ?? 'Failed to upload photo')
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function handleUpdateCard() {
    setUpdatingCard(true)
    try {
      const { data } = await api.post('/api/mobile/payment-method/setup')
      const { error: initError } = await initPaymentSheet({
        setupIntentClientSecret: data.setupIntentClientSecret,
        merchantDisplayName: 'OOMA Wellness',
        returnURL: 'ooma://stripe-redirect',
        style: 'alwaysLight',
      })
      if (initError) throw new Error(initError.message)
      const { error: presentError } = await presentPaymentSheet()
      if (presentError) {
        if (presentError.code !== 'Canceled') Alert.alert('Error', presentError.message)
        return
      }
      await api.post('/api/mobile/payment-method/confirm', { setupIntentId: data.setupIntentId })
      fetchCard()
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not update card.')
    } finally {
      setUpdatingCard(false)
    }
  }

  async function handleSignOut() {
    await signOut()
  }

  async function handleDeleteAccountPress() {
    setLoadingDeletePreview(true)
    try {
      const { data } = await api.get('/api/mobile/account')
      setDeletionPreview(data)
      setDeleteConfirmText('')
      setShowDeleteModal(true)
    } catch {
      Alert.alert('Error', 'Could not load account details. Please try again.')
    } finally {
      setLoadingDeletePreview(false)
    }
  }

  async function confirmDeleteAccount() {
    if (deleteConfirmText !== 'DELETE') return
    setDeletingAccount(true)
    try {
      await api.delete('/api/mobile/account')
      setShowDeleteModal(false)
      await signOut()
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Something went wrong. Please try again.')
    } finally {
      setDeletingAccount(false)
    }
  }

  async function handleLanguageSelect(lang: AppLanguage) {
    if (lang === language) { setShowLanguageModal(false); return }
    setSavingLanguage(true)
    try {
      await api.patch('/api/user/update', { userId: user!.id, language: lang })
      setLanguage(lang)
      setShowLanguageModal(false)
      setNotifToast({ visible: true, message: t('profile.language.updated'), isError: false })
    } catch {
      setNotifToast({ visible: true, message: t('common.somethingWentWrong'), isError: true })
    } finally {
      setSavingLanguage(false)
    }
  }

  const initials = [displayUser?.name, displayUser?.lastName]
    .filter(Boolean)
    .map(s => s!.charAt(0).toUpperCase())
    .join('')

  const maxDob = new Date()
  maxDob.setFullYear(maxDob.getFullYear() - 14)

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Heading */}
        <View style={styles.headingRow}>
          <Text style={styles.headingRegular}>{t('profile.my')} </Text>
          <Text style={styles.headingItalic}>{t('profile.title')}</Text>
        </View>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handleChangePhoto} disabled={uploadingPhoto} activeOpacity={0.8}>
            {displayUser?.profilePicture && displayUser?.id ? (
              <Image
                source={{ uri: `${API_BASE_URL}/api/user/profile-picture?userId=${displayUser.id}&v=${photoVersion}` }}
                style={styles.avatarImage}
              />
            ) : (
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitials}>{initials || '?'}</Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              {uploadingPhoto
                ? <ActivityIndicator size="small" color={C.cream} />
                : <Text style={styles.avatarEditIcon}>✎</Text>
              }
            </View>
          </TouchableOpacity>
        </View>

        {/* Info card — read-only */}
        <View style={styles.infoCard}>
          <InfoRow label={t('onboarding.about.firstNameLabel')} value={displayUser?.name} />
          <View style={styles.rowDivider} />
          <InfoRow label={t('onboarding.about.lastNameLabel')} value={displayUser?.lastName} />
          <View style={styles.rowDivider} />
          <InfoRow
            label={t('profile.info.email').toUpperCase()}
            value={displayUser?.email}
            trailing={
              !isStaff ? (
                <TouchableOpacity onPress={openEmailModal} style={styles.changeEmailBtn}>
                  <Text style={styles.changeEmailText}>Change</Text>
                </TouchableOpacity>
              ) : undefined
            }
          />
          <View style={styles.rowDivider} />
          <InfoRow label={t('profile.info.phone').toUpperCase()} value={displayUser?.phone} />
          {!isStaff && (
            <>
              <View style={styles.rowDivider} />
              <InfoRow
                label={t('profile.info.birthday').toUpperCase()}
                value={extProfile.birthday ? format(new Date(extProfile.birthday), 'MMMM d, yyyy') : null}
              />
              <View style={styles.rowDivider} />
              <View style={styles.infoRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>{t('profile.info.goals').toUpperCase()}</Text>
                  {extProfile.userGoalIds.length > 0 ? (
                    <View style={styles.goalsReadonlyRow}>
                      {extProfile.goals?.split(', ').map((label, i) => (
                        <View key={i} style={styles.goalPillReadonly}>
                          <Text style={styles.goalPillReadonlyText}>
                            {t(`onboarding.goals.labels.${label}` as any, { defaultValue: label })}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.infoValue}>{extProfile.goals ?? '—'}</Text>
                  )}
                </View>
              </View>
              <View style={styles.rowDivider} />
              <InfoRow
                label={t('profile.info.conditions').toUpperCase()}
                value={extProfile.additionalInfo
                  ? extProfile.additionalInfo.split(', ').map(part => {
                      if (part.startsWith('Other: ')) return `${t('onboarding.more.conditions.Other')}: ${part.slice(7)}`
                      return t(`onboarding.more.conditions.${part}` as any, { defaultValue: part })
                    }).join(', ')
                  : '—'}
              />
            </>
          )}
        </View>

        {/* Edit Profile button — students only */}
        {!isStaff && (
          <TouchableOpacity style={styles.editProfileBtn} onPress={openEditModal}>
            <Text style={styles.editProfileBtnText}>{t('profile.info.editButton')}</Text>
          </TouchableOpacity>
        )}

        {/* Student Status toggle — only visible in active tenant session with correct permission */}
        {tenantUser && (isOwner || canMarkAsStudent) && (
          <View style={styles.studentToggleRow}>
            <View>
              <Text style={styles.studentToggleLabel}>Student Status</Text>
              <Text style={styles.studentToggleSub}>
                {studentStatus ? 'Has access to student packages' : 'No student discount'}
              </Text>
            </View>
            <Switch
              value={studentStatus}
              onValueChange={toggleStudentStatus}
              disabled={savingStudent}
              trackColor={{ false: C.boneDark, true: C.burgSoft }}
              thumbColor={studentStatus ? C.burg : C.midGray}
            />
          </View>
        )}

        {/* Gift a class — only visible in active tenant session with canGiftClasses permission */}
        {tenantUser && (isOwner || canGiftClasses) && (
          <TouchableOpacity style={styles.giftBtn} onPress={openGiftClassModal}>
            <Text style={styles.giftBtnText}>🎁 Gift a class</Text>
          </TouchableOpacity>
        )}

        {/* My Subscriptions — shown for regular users and admins in an active tenant session */}
        {(!isStaff || !!tenantUser) && (
          <View style={styles.packagesSection}>
            <Text style={styles.sectionLabel}>{t('profile.subscriptions.title')}</Text>
            <View style={styles.creditsDivider} />

            {loadingSubscriptions ? (
              <ActivityIndicator size="small" color={C.burg} style={{ marginVertical: 16 }} />
            ) : subscriptions.length === 0 ? (
              <View>
                <Text style={styles.emptyPackagesText}>{t('profile.subscriptions.empty')}</Text>
                <TouchableOpacity style={styles.seePlansBtn} onPress={() => router.push('/(tabs)/packages')}>
                  <Text style={styles.seePlansBtnText}>{t('profile.subscriptions.seePlans')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Total classes remaining across subscriptions */}
                <View style={styles.totalClassesRow}>
                  <Text style={styles.totalClassesNumber}>
                    {subscriptions.reduce((sum, sub) => {
                      const credit = sub.credits?.[0]
                      if (credit?.isUnlimited) return sum
                      return sum + (credit?.creditsRemaining ?? sub.package.classCount)
                    }, 0)}
                  </Text>
                  <Text style={styles.totalClassesLabel}>{t('profile.subscriptions.classesRemaining')}</Text>
                </View>

                {/* Pending plan change note */}
                {subscriptions.filter(s => s.status === 'PENDING').map(pending => (
                  <View key={pending.id} style={styles.pendingPlanNote}>
                    <Text style={styles.pendingPlanNoteText}>
                      {t('profile.subscriptions.pendingChange', {
                        name: pending.package.name,
                        date: format(new Date(pending.currentPeriodStart), 'MMM d, yyyy'),
                      })}
                    </Text>
                  </View>
                ))}

                {subscriptions.filter(s => s.status !== 'PENDING').map(sub => {
                  const isCancelling = sub.cancelledAt !== null && sub.status === 'ACTIVE'
                  const periodEndDate = new Date(sub.currentPeriodEnd)
                  const periodEnd = format(periodEndDate, 'MMM d, yyyy')
                  const periodEndShort = format(periodEndDate, 'd MMM').toUpperCase()
                  const credit = sub.credits?.[0]
                  const remaining = credit?.isUnlimited ? '∞' : (credit?.creditsRemaining ?? 0)
                  const total    = credit?.isUnlimited ? '∞' : (credit?.creditsTotal    ?? 0)
                  const daysUntilRenewal = Math.ceil((periodEndDate.getTime() - Date.now()) / 86_400_000)
                  const billingPillColors = daysUntilRenewal >= 10
                    ? { bg: '#D6EFD8', text: '#2D6A4F' }
                    : daysUntilRenewal >= 6
                    ? { bg: '#FFF3CD', text: '#856404' }
                    : { bg: '#FFE5CC', text: '#CC5500' }
                  const pricePerClass = sub.package.classCount > 0
                    ? (sub.package.price / sub.package.classCount).toFixed(0)
                    : null

                  const packageTypeLabel = sub.package.packageType === 'REFORMER'
                    ? t('classes.typeReformer')
                    : sub.package.packageType === 'YOGA'
                    ? t('classes.typeYoga')
                    : `${t('classes.typeReformer')} + ${t('classes.typeYoga')}`

                  return (
                    <View key={sub.id} style={styles.subCard}>
                      {/* Header: PLAN ACTIVO · REFORMER PILATES */}
                      <Text style={styles.subCardHeader}>
                        {isCancelling
                          ? t('profile.subscriptions.planCancelling')
                          : sub.status === 'PAST_DUE'
                          ? t('profile.subscriptions.planPastDue')
                          : t('profile.subscriptions.planActive')} · {packageTypeLabel.toUpperCase()}
                      </Text>

                      {/* Name + price pill */}
                      <View style={styles.subCardTop}>
                        <Text style={styles.subName}>{sub.package.name}</Text>
                        <Text style={styles.subPricePillText}>€{sub.package.price.toFixed(0)}<Text style={styles.subPricePillPer}> /mes</Text></Text>
                      </View>

                      {/* Subtitle */}
                      {pricePerClass && !credit?.isUnlimited && (
                        <Text style={styles.subClassCount}>
                          {t('profile.subscriptions.classesPerMonthAt', { count: sub.package.classCount, price: pricePerClass })}
                        </Text>
                      )}

                      {/* Billing pill or expiry */}
                      {isCancelling ? (
                        <Text style={[styles.subRenewal, { marginTop: 8 }]}>{t('profile.subscriptions.expiresOn', { date: periodEnd })}</Text>
                      ) : (
                        <View style={[styles.billingPill, { backgroundColor: billingPillColors.bg, marginTop: 10 }]}>
                          <View style={[styles.billingPillDot, { backgroundColor: billingPillColors.text }]} />
                          <Text style={[styles.billingPillText, { color: billingPillColors.text }]}>
                            {t('profile.subscriptions.nextBillingDate')} {periodEndShort}
                          </Text>
                        </View>
                      )}

                      {/* Actions */}
                      {!isCancelling && (sub.status === 'ACTIVE' || sub.status === 'PAST_DUE') && (
                        <>
                          <View style={[styles.creditsDivider, { marginTop: 14, marginBottom: 12 }]} />
                          {sub.status === 'PAST_DUE' ? (
                            <Text style={styles.pastDueHint}>{t('profile.subscriptions.pastDueHint')}</Text>
                          ) : (!isStaff || !!tenantUser) ? (
                            <TouchableOpacity style={styles.changePlanBtn} onPress={() => router.push('/(tabs)/packages')}>
                              <Text style={styles.changePlanBtnText}>{t('profile.subscriptions.changePlan')}</Text>
                            </TouchableOpacity>
                          ) : null}
                          {sub.status === 'ACTIVE' && (
                            <TouchableOpacity
                              style={[styles.cancelPlanBtn, (isStaff || sub.status === 'PAST_DUE') && { marginTop: 0 }]}
                              onPress={() => setCancelTarget(sub)}
                            >
                              <Text style={styles.cancelPlanBtnText}>{t('profile.subscriptions.cancelAction').toUpperCase()}</Text>
                            </TouchableOpacity>
                          )}
                        </>
                      )}
                    </View>
                  )
                })}

              </>
            )}
          </View>
        )}


        {/* Single Classes — all single-class credits for this user */}
        {(!isStaff || !!tenantUser) && (
          <View style={styles.packagesSection}>
            <Text style={styles.sectionLabel}>{t('profile.singleClasses.title')}</Text>
            <View style={styles.creditsDivider} />

            {loadingSubscriptions ? (
              <ActivityIndicator size="small" color={C.burg} style={{ marginVertical: 16 }} />
            ) : standaloneCredits.length === 0 ? (
              <View>
                <Text style={styles.emptyPackagesText}>{t('profile.singleClasses.empty')}</Text>
                <Text style={[styles.emptyPackagesText, { marginBottom: 12 }]}>{t('profile.singleClasses.emptyPrompt')}</Text>
                <TouchableOpacity style={styles.seePlansBtn} onPress={() => router.push('/(tabs)/packages')}>
                  <Text style={styles.seePlansBtnText}>{t('profile.singleClasses.seePlans')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              standaloneCredits.map(credit => {
                const status = getSingleClassStatus(credit)
                const name = credit.package?.name ?? t('profile.subscriptions.giftClass')
                const typeLabel = credit.package?.packageType === 'REFORMER'
                  ? t('classes.typeReformer')
                  : credit.package?.packageType === 'YOGA'
                  ? t('classes.typeYoga')
                  : `${t('classes.typeReformer')} + ${t('classes.typeYoga')}`
                const booking = credit.bookings?.[0]
                const statusLabel = status === 'active'
                  ? t('profile.subscriptions.statusActive')
                  : status === 'booked'
                  ? t('profile.singleClasses.statusBooked')
                  : status === 'attended'
                  ? t('profile.singleClasses.statusAttended')
                  : t('profile.singleClasses.statusExpired')
                const statusColor = status === 'active' ? C.green
                  : status === 'booked' ? '#856404'
                  : status === 'attended' ? C.burg
                  : C.midGray
                return (
                  <View key={credit.id} style={styles.subCard}>
                    <View style={styles.subCardTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subName}>{name}</Text>
                        <Text style={styles.subMeta}>{typeLabel}</Text>
                      </View>
                      <View style={styles.subStatusBadge}>
                        <Text style={[styles.subStatusText, { color: statusColor }]}>{statusLabel.toUpperCase()}</Text>
                      </View>
                    </View>
                    {(status === 'booked' || status === 'attended') && booking && (
                      <Text style={styles.subCredits}>
                        {booking.class.title} · {format(new Date(booking.class.startTime), 'EEE d MMM, HH:mm')}
                      </Text>
                    )}
                    {(status === 'active' || status === 'expired') && credit.expiresAt && (
                      <Text style={styles.subRenewal}>
                        {t('profile.subscriptions.expiresOn', { date: format(new Date(credit.expiresAt), 'MMM d, yyyy') })}
                      </Text>
                    )}
                  </View>
                )
              })
            )}
          </View>
        )}

        {/* Payment Method — always shown for non-admin users */}
        {(!isStaff || !!tenantUser) && (
          <View style={styles.paymentMethodSection}>
            <Text style={styles.sectionLabel}>PAYMENT METHOD</Text>
            <View style={styles.creditsDivider} />
            {loadingCard ? (
              <ActivityIndicator size="small" color={C.burg} style={{ marginVertical: 20 }} />
            ) : card ? (
              <>
                <View style={styles.creditCardVisual}>
                  {/* Chip */}
                  <View style={styles.cardChip} />
                  {/* Number + brand logo on the same row */}
                  <View style={styles.cardNumberRow}>
                    <Text style={styles.cardNumber}>•••• •••• •••• {card.last4}</Text>
                    {card.brand === 'mastercard' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#EB001B' }} />
                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#F79E1B', marginLeft: -10, opacity: 0.9 }} />
                      </View>
                    ) : card.brand === 'visa' ? (
                      <Text style={styles.cardBrandVisa}>VISA</Text>
                    ) : card.brand === 'amex' ? (
                      <View style={styles.cardBrandAmex}>
                        <Text style={styles.cardBrandAmexText}>AMEX</Text>
                      </View>
                    ) : (
                      <Text style={styles.cardBrandText}>{card.brand.toUpperCase()}</Text>
                    )}
                  </View>
                  {/* Bottom row */}
                  <View style={styles.cardBottom}>
                    <View>
                      <Text style={styles.cardLabel}>CARDHOLDER</Text>
                      <Text style={styles.cardName}>
                        {[displayUser?.name, displayUser?.lastName].filter(Boolean).join(' ').toUpperCase() || '—'}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.cardLabel}>EXPIRES</Text>
                      <Text style={styles.cardName}>{String(card.expMonth).padStart(2, '0')}/{String(card.expYear).slice(-2)}</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity style={styles.updateCardBtn} onPress={handleUpdateCard} disabled={updatingCard}>
                  {updatingCard
                    ? <ActivityIndicator size="small" color={C.cream} />
                    : <Text style={styles.updateCardBtnText}>Update Card</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.noCardHint}>{t('profile.payment.noCardHint')}</Text>
                <TouchableOpacity style={[styles.updateCardBtn, { marginTop: 14, alignSelf: 'flex-start' }]} onPress={handleUpdateCard} disabled={updatingCard}>
                  {updatingCard
                    ? <ActivityIndicator size="small" color={C.cream} />
                    : <Text style={styles.updateCardBtnText}>Add Card</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Class Pass / Wallet card */}
        {!tenantUser && <View style={styles.passCard}>
          <Text style={styles.creditsCardLabel}>{t('profile.wallet.title')}</Text>
          <View style={styles.creditsDivider} />

          {qrCode ? (
            <View style={styles.qrWrapper}>
              <QRCode value={qrCode} size={160} color={C.ink} backgroundColor={C.warmWhite} />
            </View>
          ) : (
            <ActivityIndicator size="small" color={C.burg} style={{ marginVertical: 20 }} />
          )}

          <Text style={styles.passName}>
            {[displayUser?.name, displayUser?.lastName].filter(Boolean).join(' ') || ''}
          </Text>
          <Text style={styles.passType}>Class Pass</Text>

          <View style={[styles.creditsDivider, { marginTop: 16, alignSelf: 'stretch' }]} />

          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={[styles.walletBtn, walletLoading && styles.btnDisabled]}
              onPress={handleAddToAppleWallet}
              disabled={walletLoading || !qrCode}
            >
              {walletLoading
                ? <ActivityIndicator size="small" color={C.cream} />
                : <Text style={styles.walletBtnText}>{t('profile.wallet.addApple')}</Text>
              }
            </TouchableOpacity>
          )}
          {Platform.OS === 'android' && (
            <TouchableOpacity
              style={[styles.walletBtn, walletLoading && styles.btnDisabled]}
              onPress={handleAddToGoogleWallet}
              disabled={walletLoading || !qrCode}
            >
              {walletLoading
                ? <ActivityIndicator size="small" color={C.cream} />
                : <Text style={styles.walletBtnText}>{t('profile.wallet.addGoogle')}</Text>
              }
            </TouchableOpacity>
          )}
        </View>}

        {/* Notifications — students only */}
        {(!isStaff || !!tenantUser) && (
          <View style={styles.notifSection}>
            <Text style={styles.sectionLabel}>{t('profile.notifications.title')}</Text>
            <View style={styles.creditsDivider} />

            <Text style={styles.notifGroupLabel}>{t('profile.notifications.email')}</Text>
            {(Object.keys(NOTIF_LABELS) as NotifType[]).map(type => (
              <View key={type} style={styles.notifRow}>
                <Text style={styles.notifLabel}>{NOTIF_LABELS[type]}</Text>
                <Switch
                  value={notifPrefs[type]}
                  onValueChange={v => handleToggleNotif(type, v)}
                  disabled={savingNotif === type}
                  trackColor={{ false: C.rule, true: C.burg }}
                  thumbColor={C.cream}
                />
              </View>
            ))}
          </View>
        )}

        {/* Language — students only, hidden in tenant mode */}
        {!isStaff && !tenantUser && (
          <TouchableOpacity style={styles.languageRow} onPress={() => setShowLanguageModal(true)}>
            <View>
              <Text style={styles.languageLabel}>{t('profile.language.title')}</Text>
              <Text style={styles.languageValue}>
                {LANGUAGES.find(l => l.code === language)?.label ?? language.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.languageChevron}>›</Text>
          </TouchableOpacity>
        )}

        {/* Sign out — hidden in tenant mode */}
        {!tenantUser && (
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Text style={styles.signOutText}>{t('profile.signOut')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.privacyPolicyBtn} onPress={() => Linking.openURL('https://oomawellness.shop/privacy')}>
          <Text style={styles.privacyPolicyText}>Privacy Policy</Text>
        </TouchableOpacity>

        {/* Danger Zone — hidden in tenant/admin mode */}
        {!isStaff && !tenantUser && (
          <View style={styles.dangerZone}>
            <Text style={styles.dangerZoneTitle}>DANGER ZONE</Text>
            <Text style={styles.dangerZoneDesc}>
              Deleting your account is permanent. Your active subscriptions will be cancelled immediately and all remaining credits will be lost.
            </Text>
            <TouchableOpacity
              style={[styles.deleteAccountBtn, loadingDeletePreview && styles.btnDisabled]}
              onPress={handleDeleteAccountPress}
              disabled={loadingDeletePreview}
            >
              {loadingDeletePreview
                ? <ActivityIndicator size="small" color={C.red} />
                : <Text style={styles.deleteAccountBtnText}>DELETE ACCOUNT</Text>
              }
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Toast
        message={notifToast.message}
        visible={notifToast.visible}
        onHide={() => setNotifToast(t => ({ ...t, visible: false }))}
      />

      {/* Cancel subscription confirmation */}
      {/* Gift a class modal */}
      <Modal visible={showGiftClassModal} transparent animationType="fade" onRequestClose={() => setShowGiftClassModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Gift a class</Text>
            <Text style={styles.modalBody}>
              Select a one-time class to gift to {tenantUser?.name ?? 'this user'}.
            </Text>
            {loadingGiftClassPackages ? (
              <ActivityIndicator color={C.burg} style={{ marginVertical: 16 }} />
            ) : giftClassPackages.length === 0 ? (
              <Text style={[styles.modalBody, { color: C.midGray }]}>No one-time packages available to gift.</Text>
            ) : (
              giftClassPackages.map(pkg => (
                <TouchableOpacity
                  key={pkg.id}
                  style={[styles.giftOption, selectedGiftClassPackage === pkg.id && styles.giftOptionSelected]}
                  onPress={() => setSelectedGiftClassPackage(pkg.id)}
                >
                  <Text style={[styles.giftOptionName, selectedGiftClassPackage === pkg.id && styles.giftOptionNameSelected]}>
                    {pkg.name}
                  </Text>
                  <Text style={styles.giftOptionMeta}>
                    {pkg.classCount} class · {pkg.packageType === 'REFORMER' ? 'Reformer Pilates' : pkg.packageType === 'YOGA' ? 'Yoga' : 'Reformer + Yoga'}
                  </Text>
                </TouchableOpacity>
              ))
            )}
            <TouchableOpacity
              style={[styles.modalConfirmBtn, (!selectedGiftClassPackage || giftingClass) && { opacity: 0.4 }]}
              onPress={handleGiftClass}
              disabled={!selectedGiftClassPackage || giftingClass}
            >
              {giftingClass
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.modalConfirmBtnText}>Confirm gift</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowGiftClassModal(false)} disabled={giftingClass}>
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!cancelTarget} transparent animationType="fade" onRequestClose={() => setCancelTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('profile.subscriptions.cancelTitle')}</Text>
            <Text style={styles.modalBody}>
              {t('profile.subscriptions.cancelBody', {
                date: cancelTarget ? format(new Date(cancelTarget.currentPeriodEnd), 'MMM d, yyyy') : '',
              })}
            </Text>
            <TouchableOpacity
              style={[styles.modalBtn, cancelling && styles.btnDisabled]}
              onPress={handleCancelSubscription}
              disabled={cancelling}
            >
              {cancelling
                ? <ActivityIndicator size="small" color={C.cream} />
                : <Text style={styles.modalBtnText}>{t('profile.subscriptions.cancelConfirmBtn')}</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.noThanksBtn} onPress={() => setCancelTarget(null)} disabled={cancelling}>
              <Text style={styles.noThanksBtnText}>{t('profile.subscriptions.keepBtn')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <WelcomeGiftModal
        visible={showGiftModal}
        onClaim={claimGift}
        onDismiss={() => setShowGiftModal(false)}
        claiming={claimingGift}
      />

      {/* Wallet success modal */}
      <Modal visible={showWalletSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconCircle}>
              <Text style={styles.modalIconText}>✓</Text>
            </View>
            <Text style={styles.modalTitle}>{t('profile.wallet.passAdded')}</Text>
            <Text style={styles.modalBody}>{t('profile.wallet.passAddedMessage')}</Text>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setShowWalletSuccessModal(false)}>
              <Text style={styles.modalBtnText}>{t('common.ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── Language picker modal ─── */}
      <Modal visible={showLanguageModal} transparent animationType="fade" onRequestClose={() => setShowLanguageModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.langPickerCard}>
            <Text style={styles.langPickerTitle}>{t('profile.language.title')}</Text>
            <View style={styles.langPickerDivider} />
            {LANGUAGES.map(lang => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.langPickerRow, lang.code === language && styles.langPickerRowActive]}
                onPress={() => handleLanguageSelect(lang.code)}
                disabled={savingLanguage}
              >
                {lang.flag === 'ca' ? (
                  <Image source={require('@/assets/flag-ca.png')} style={styles.langPickerFlag} resizeMode="cover" />
                ) : (
                  <Text style={styles.langPickerEmoji}>{lang.flag}</Text>
                )}
                <Text style={[styles.langPickerLabel, lang.code === language && styles.langPickerLabelActive]}>
                  {lang.label}
                </Text>
                {lang.code === language && <Text style={styles.langPickerCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
            {savingLanguage && <ActivityIndicator size="small" color={C.burg} style={{ marginTop: 12 }} />}
            <TouchableOpacity style={styles.langPickerCancel} onPress={() => setShowLanguageModal(false)} disabled={savingLanguage}>
              <Text style={styles.langPickerCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── Delete account confirmation modal ─── */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!deletingAccount) setShowDeleteModal(false) }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModalCard}>
            <Text style={styles.deleteModalTitle}>Delete Account</Text>

            {deletionPreview && (
              <>
                {deletionPreview.activeSubscriptions.length > 0 && (
                  <View style={styles.deletePreviewItem}>
                    <Text style={styles.deletePreviewLabel}>SUBSCRIPTIONS TO BE CANCELLED</Text>
                    {deletionPreview.activeSubscriptions.map(s => (
                      <Text key={s.id} style={styles.deletePreviewValue}>• {s.name}</Text>
                    ))}
                  </View>
                )}
                {deletionPreview.upcomingBookingsCount > 0 && (
                  <View style={styles.deletePreviewItem}>
                    <Text style={styles.deletePreviewLabel}>UPCOMING BOOKINGS TO BE CANCELLED</Text>
                    <Text style={styles.deletePreviewValue}>
                      {deletionPreview.upcomingBookingsCount} booking{deletionPreview.upcomingBookingsCount !== 1 ? 's' : ''} — credits will not be refunded
                    </Text>
                  </View>
                )}
                {(deletionPreview.totalCreditsRemaining > 0 || deletionPreview.hasUnlimited) && (
                  <View style={styles.deletePreviewItem}>
                    <Text style={styles.deletePreviewLabel}>CREDITS THAT WILL BE LOST</Text>
                    <Text style={styles.deletePreviewValue}>
                      {deletionPreview.hasUnlimited
                        ? 'Unlimited access'
                        : `${deletionPreview.totalCreditsRemaining} class credit${deletionPreview.totalCreditsRemaining !== 1 ? 's' : ''}`}
                    </Text>
                  </View>
                )}
                {deletionPreview.activeSubscriptions.length === 0 &&
                  deletionPreview.upcomingBookingsCount === 0 &&
                  deletionPreview.totalCreditsRemaining === 0 &&
                  !deletionPreview.hasUnlimited && (
                  <View style={styles.deletePreviewItem}>
                    <Text style={styles.deletePreviewValue}>You have no active subscriptions, upcoming bookings, or remaining credits.</Text>
                  </View>
                )}
              </>
            )}

            <Text style={styles.deleteConfirmPrompt}>Type DELETE to confirm:</Text>
            <TextInput
              style={styles.deleteConfirmInput}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="DELETE"
              placeholderTextColor={C.lightGray}
              autoCapitalize="characters"
              editable={!deletingAccount}
            />

            <TouchableOpacity
              style={[styles.deleteConfirmBtn, (deleteConfirmText !== 'DELETE' || deletingAccount) && styles.btnDisabled]}
              onPress={confirmDeleteAccount}
              disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
            >
              {deletingAccount
                ? <ActivityIndicator size="small" color={C.cream} />
                : <Text style={styles.deleteConfirmBtnText}>DELETE MY ACCOUNT</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.noThanksBtn}
              onPress={() => setShowDeleteModal(false)}
              disabled={deletingAccount}
            >
              <Text style={styles.noThanksBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── Edit Profile modal ─── */}
      <Modal visible={showEditModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSheetSafe}>
          <View style={styles.modalSheetHeader}>
            <TouchableOpacity onPress={() => setShowEditModal(false)} disabled={savingEdit}>
              <Text style={styles.modalSheetCancel}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalSheetTitle}>{t('profile.editProfile.title')}</Text>
            <TouchableOpacity onPress={saveEditProfile} disabled={savingEdit}>
              {savingEdit
                ? <ActivityIndicator size="small" color={C.burg} />
                : <Text style={styles.modalSheetSave}>{t('common.save')}</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalSheetBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.editFieldLabel}>{t('profile.editProfile.firstNameLabel')}</Text>
            <TextInput
              style={styles.editInput}
              value={editName}
              onChangeText={v => { setEditName(v); setEditError('') }}
              autoCapitalize="words"
              placeholderTextColor={C.lightGray}
            />

            <Text style={styles.editFieldLabel}>{t('profile.editProfile.lastNameLabel')}</Text>
            <TextInput
              style={styles.editInput}
              value={editLastName}
              onChangeText={v => { setEditLastName(v); setEditError('') }}
              autoCapitalize="words"
              placeholderTextColor={C.lightGray}
            />

            <Text style={styles.editFieldLabel}>{t('profile.editProfile.phoneLabel')}</Text>
            <TextInput
              style={styles.editInput}
              value={editPhone}
              onChangeText={v => { setEditPhone(v); setEditError('') }}
              keyboardType="phone-pad"
              placeholderTextColor={C.lightGray}
            />

            <Text style={styles.editFieldLabel}>{t('profile.editProfile.birthdayLabel')}</Text>
            <TouchableOpacity
              style={styles.dobDisplayBtn}
              onPress={() => setShowDobPicker(v => !v)}
            >
              <Text style={styles.dobDisplayText}>
                {editDob ? format(new Date(editDob), 'MMMM d, yyyy') : 'Select date'}
              </Text>
            </TouchableOpacity>
            {showDobPicker && (
              <DateTimePicker
                value={editDobDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={maxDob}
                onChange={(_, d) => {
                  if (Platform.OS === 'android') setShowDobPicker(false)
                  if (d) {
                    setEditDobDate(d)
                    setEditDob(d.toISOString())
                  }
                }}
              />
            )}

            <Text style={styles.editFieldLabel}>{t('profile.editProfile.goalsLabel')}</Text>
            {extProfile.userGoalIds.length === 0 && extProfile.goals !== null && (
              <Text style={styles.legacyGoalsNotice}>
                Your previously saved goals were entered as text. Please select your goals from the list below to update them.
              </Text>
            )}
            <GoalSelector
              selectedIds={editGoalIds}
              onChange={ids => { setEditGoalIds(ids); setEditError('') }}
            />

            <Text style={styles.editFieldLabel}>{t('profile.editProfile.conditionsLabel')}</Text>
            <TouchableOpacity style={styles.conditionsEditRow} onPress={() => openConditionsModal(true)}>
              <Text style={styles.conditionsEditValue} numberOfLines={2}>
                {extProfile.additionalInfo ?? t('common.no')}
              </Text>
              <Text style={styles.conditionsEditChevron}>›</Text>
            </TouchableOpacity>

            {editError ? <Text style={styles.editError}>{editError}</Text> : null}

            <TouchableOpacity
              style={[styles.sheetSaveBtn, savingEdit && styles.btnDisabled]}
              onPress={saveEditProfile}
              disabled={savingEdit}
            >
              {savingEdit
                ? <ActivityIndicator size="small" color={C.cream} />
                : <Text style={styles.sheetSaveBtnText}>{t('profile.editProfile.saveButton')}</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Medical Conditions modal */}
      <Modal visible={showConditionsModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSheetSafe}>
          <View style={styles.modalSheetHeader}>
            <TouchableOpacity onPress={() => setShowConditionsModal(false)} disabled={savingConditions}>
              <Text style={styles.modalSheetCancel}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.modalSheetTitle}>{t('profile.conditions.title')}</Text>
            <TouchableOpacity onPress={saveConditions} disabled={savingConditions}>
              {savingConditions
                ? <ActivityIndicator size="small" color={C.burg} />
                : <Text style={styles.modalSheetSave}>{t('profile.conditions.saveButton')}</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalSheetBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.condQuestion}>{t('profile.conditions.question')}</Text>
            <View style={styles.yesNoRow}>
              <TouchableOpacity
                style={[styles.yesNoBtn, condHasConditions === false && styles.yesNoBtnActive]}
                onPress={() => { setCondHasConditions(false); setCondSelected([]) }}
              >
                <Text style={[styles.yesNoText, condHasConditions === false && styles.yesNoTextActive]}>{t('profile.conditions.no')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.yesNoBtn, condHasConditions === true && styles.yesNoBtnActive]}
                onPress={() => setCondHasConditions(true)}
              >
                <Text style={[styles.yesNoText, condHasConditions === true && styles.yesNoTextActive]}>{t('profile.conditions.yes')}</Text>
              </TouchableOpacity>
            </View>

            {condHasConditions === true && (
              <View style={styles.conditionsGrid}>
                <Text style={styles.selectAllLabel}>SELECT ALL THAT APPLY</Text>
                <View style={styles.conditionsRow}>
                  {(CONDITIONS as readonly string[]).map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.conditionChip, condSelected.includes(c) && styles.conditionChipActive]}
                      onPress={() => toggleCondition(c)}
                    >
                      <Text style={[styles.conditionText, condSelected.includes(c) && styles.conditionTextActive]}>
                        {condSelected.includes(c) ? '☑ ' : '☐ '}{c}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[styles.conditionChipWide, condSelected.includes('Other') && styles.conditionChipActive]}
                    onPress={() => toggleCondition('Other')}
                  >
                    <Text style={[styles.conditionText, condSelected.includes('Other') && styles.conditionTextActive]}>
                      {condSelected.includes('Other') ? '☑ ' : '☐ '}Other (specify)
                    </Text>
                  </TouchableOpacity>
                  {condSelected.includes('Other') && (
                    <TextInput
                      style={styles.otherInput}
                      value={condOther}
                      onChangeText={setCondOther}
                      placeholder="Please describe..."
                      placeholderTextColor={C.lightGray}
                    />
                  )}
                </View>
              </View>
            )}

            {condError ? <Text style={styles.condError}>{condError}</Text> : null}

            <TouchableOpacity
              style={[styles.sheetSaveBtn, savingConditions && styles.btnDisabled]}
              onPress={saveConditions}
              disabled={savingConditions}
            >
              {savingConditions
                ? <ActivityIndicator size="small" color={C.cream} />
                : <Text style={styles.sheetSaveBtnText}>{t('profile.editProfile.saveButton')}</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Email change modal */}
      <Modal visible={showEmailModal} transparent animationType="fade" onRequestClose={() => setShowEmailModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { gap: 0 }]}>
            <Text style={[styles.modalTitle, { marginBottom: 8 }]}>Change Email</Text>
            <View style={styles.creditsDivider} />

            {emailStep === 1 && (
              <View style={{ width: '100%', gap: 8 }}>
                <Text style={styles.modalBody}>Enter your current password to continue.</Text>
                <TextInput
                  style={[styles.editInput, { marginTop: 8 }]}
                  value={emailPassword}
                  onChangeText={v => { setEmailPassword(v); setEmailPasswordError('') }}
                  placeholder="Current password"
                  placeholderTextColor={C.lightGray}
                  secureTextEntry
                  autoFocus
                />
                {emailPasswordError ? <Text style={styles.editError}>{emailPasswordError}</Text> : null}
                <TouchableOpacity
                  style={[styles.modalBtn, emailLoading && styles.btnDisabled, { marginTop: 8 }]}
                  onPress={handleVerifyPassword}
                  disabled={emailLoading}
                >
                  {emailLoading
                    ? <ActivityIndicator size="small" color={C.cream} />
                    : <Text style={styles.modalBtnText}>CONTINUE</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={styles.noThanksBtn} onPress={() => setShowEmailModal(false)}>
                  <Text style={styles.noThanksBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {emailStep === 2 && (
              <View style={{ width: '100%', gap: 8 }}>
                <Text style={styles.modalBody}>Enter your new email address.</Text>
                <TextInput
                  style={[styles.editInput, { marginTop: 8 }]}
                  value={newEmail}
                  onChangeText={v => { setNewEmail(v); setNewEmailError('') }}
                  placeholder="New email address"
                  placeholderTextColor={C.lightGray}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoFocus
                />
                {newEmailError ? <Text style={styles.editError}>{newEmailError}</Text> : null}
                <TouchableOpacity
                  style={[styles.modalBtn, emailLoading && styles.btnDisabled, { marginTop: 8 }]}
                  onPress={handleRequestEmailChange}
                  disabled={emailLoading}
                >
                  {emailLoading
                    ? <ActivityIndicator size="small" color={C.cream} />
                    : <Text style={styles.modalBtnText}>SEND VERIFICATION LINK</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={styles.noThanksBtn} onPress={() => setShowEmailModal(false)}>
                  <Text style={styles.noThanksBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {emailStep === 3 && (
              <View style={{ width: '100%', gap: 8, alignItems: 'center' }}>
                <View style={[styles.modalIconCircle, { marginTop: 8 }]}>
                  <Text style={styles.modalIconText}>✓</Text>
                </View>
                <Text style={[styles.modalBody, { textAlign: 'center', marginTop: 4 }]}>
                  A verification link has been sent to{' '}
                  <Text style={{ color: C.burg, fontFamily: F.sansMed }}>{newEmail}</Text>.
                  {'\n\n'}Your email will be updated once you click the link.
                </Text>
                <TouchableOpacity style={[styles.modalBtn, { marginTop: 8 }]} onPress={() => { setShowEmailModal(false); openMailApp() }}>
                  <Text style={styles.modalBtnText}>OPEN EMAIL</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.noThanksBtn} onPress={() => setShowEmailModal(false)}>
                  <Text style={styles.noThanksBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.cream },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 24, marginTop: 8 },
  headingRegular: { fontFamily: F.serifReg, fontSize: 32, color: C.ink },
  headingItalic: { fontFamily: F.serif, fontSize: 32, color: C.burg },
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatarImage: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: C.rule },
  avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.burgPale, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontFamily: F.serifBold, fontSize: 28, color: C.burg },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: C.burg, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.cream,
  },
  avatarEditIcon: { fontSize: 13, color: C.cream, lineHeight: 16 },
  infoCard: {
    backgroundColor: C.warmWhite, borderWidth: 1, borderColor: C.rule,
    borderRadius: 4, marginBottom: 12, overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 14,
  },
  infoLabel: {
    fontFamily: F.sansMed, fontSize: 9, color: C.midGray,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4,
  },
  infoValue: { fontFamily: F.sansReg, fontSize: 14, color: C.ink },
  goalsReadonlyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  goalPillReadonly: {
    borderWidth: 1, borderColor: C.midGray, borderRadius: 100,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  goalPillReadonlyText: { fontFamily: F.sansReg, fontSize: 12, color: C.midGray },
  legacyGoalsNotice: {
    fontFamily: F.sansReg, fontSize: 12, color: C.midGray,
    marginBottom: 8, lineHeight: 17,
  },
  rowDivider: { height: 1, backgroundColor: C.rule },
  changeEmailBtn: { paddingLeft: 12, paddingVertical: 4 },
  changeEmailText: { fontFamily: F.sansMed, fontSize: 12, color: C.burg, textDecorationLine: 'underline' },
  editProfileBtn: {
    height: 48, borderWidth: 1, borderColor: C.ink, borderRadius: 2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  editProfileBtnText: { fontFamily: F.sansMed, fontSize: 11, color: C.ink, letterSpacing: 2 },
  privacyPolicyBtn: { alignItems: 'center', paddingVertical: 12, marginBottom: 4 },
  privacyPolicyText: { fontFamily: F.sansReg, fontSize: 11, color: C.midGray, textDecorationLine: 'underline' },
  packagesSection: {
    backgroundColor: C.warmWhite, borderWidth: 1, borderColor: C.rule,
    borderRadius: 4, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 18, marginBottom: 16,
  },
  sectionLabel: {
    fontFamily: F.sansMed, fontSize: 9, color: C.midGray,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12,
  },
  creditsDivider: { height: 1, backgroundColor: C.rule, alignSelf: 'stretch', marginBottom: 12 },
  totalClassesRow: { alignItems: 'center', marginBottom: 16 },
  totalClassesNumber: { fontFamily: F.serifBold, fontSize: 56, color: C.burg, lineHeight: 60 },
  totalClassesLabel: {
    fontFamily: F.sansReg, fontSize: 11, color: C.midGray,
    letterSpacing: 2, textTransform: 'uppercase', marginTop: 2,
  },
  emptyPackagesText: { fontFamily: F.sansReg, fontSize: 13, color: C.midGray, marginBottom: 8 },
  seePlansBtn: {
    height: 44, backgroundColor: C.burg, borderRadius: 2,
    alignItems: 'center', justifyContent: 'center', marginTop: 4, marginBottom: 8,
  },
  seePlansBtnText: { fontFamily: F.sansMed, fontSize: 11, color: C.cream, letterSpacing: 2, textTransform: 'uppercase' },
  noCardHint: { fontFamily: F.sansReg, fontSize: 12, color: C.midGray, lineHeight: 18 },
  packageCard: {
    backgroundColor: C.cream, borderWidth: 1, borderColor: C.rule,
    borderRadius: 3, padding: 14, marginBottom: 10,
  },
  packageCardMuted: { opacity: 0.6 },
  packageCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  packageName: { fontFamily: F.serifBold, fontSize: 16, color: C.ink },
  packageTypeLabel: { fontFamily: F.sansMed, fontSize: 10, color: C.burg, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 2 },
  packageCount: { fontFamily: F.sansMed, fontSize: 12, color: C.burg },
  progressBar: { height: 4, backgroundColor: C.rule, borderRadius: 2, marginBottom: 8, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: C.burg, borderRadius: 2 },
  progressFillMuted: { backgroundColor: C.midGray },
  packageExpiry: { fontFamily: F.sansReg, fontSize: 11, color: C.midGray },
  mutedText: { color: C.midGray },
  showExpiredRow: { paddingVertical: 6, marginBottom: 8 },
  showExpiredText: { fontFamily: F.sansMed, fontSize: 12, color: C.burg, textDecorationLine: 'underline' },
  buyBtn: {
    height: 44, backgroundColor: C.ink, borderRadius: 2,
    alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  buyBtnDisabled: {
    backgroundColor: C.lightGray,
  },
  buyBtnText: { fontFamily: F.sansMed, fontSize: 11, color: C.cream, letterSpacing: 2, textTransform: 'uppercase' },
  signOutBtn: { height: 48, backgroundColor: C.wine, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  signOutText: { fontFamily: F.sansMed, fontSize: 11, color: '#fff', letterSpacing: 2, textTransform: 'uppercase' },
  paymentMethodSection: {
    backgroundColor: C.warmWhite,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    padding: 16,
    marginBottom: 12,
  },
  creditCardVisual: {
    backgroundColor: C.midGray,
    borderRadius: 12,
    padding: 20,
    marginTop: 14,
    marginBottom: 14,
    minHeight: 148,
    justifyContent: 'space-between',
  },
  cardChip: {
    width: 36,
    height: 26,
    backgroundColor: C.burgSoft,
    borderRadius: 4,
    opacity: 0.9,
  },
  cardNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  cardNumber: {
    fontFamily: F.sansMed,
    fontSize: 17,
    color: C.cream,
    letterSpacing: 3,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  cardLabel: {
    fontFamily: F.sansReg,
    fontSize: 8,
    color: C.lightGray,
    letterSpacing: 1,
    marginBottom: 2,
  },
  cardName: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.cream,
    letterSpacing: 1,
  },
  cardBrandText: {
    fontFamily: F.sansMed,
    fontSize: 13,
    color: C.cream,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardBrandVisa: {
    fontFamily: F.serifBold,
    fontSize: 22,
    color: C.cream,
    letterSpacing: 2,
  },
  cardBrandAmex: {
    borderWidth: 1.5,
    borderColor: C.cream,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cardBrandAmexText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.cream,
    letterSpacing: 1.5,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  cardExpiry: {
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.midGray,
    marginTop: 2,
  },
  updateCardBtn: {
    backgroundColor: C.burg,
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  updateCardBtnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.cream,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // Language row
  languageRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.warmWhite, borderWidth: 1, borderColor: C.rule,
    borderRadius: 4, paddingHorizontal: 18, paddingVertical: 14, marginBottom: 16,
  },
  languageLabel: { fontFamily: F.sansMed, fontSize: 9, color: C.midGray, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  languageValue: { fontFamily: F.sansReg, fontSize: 14, color: C.ink },
  languageChevron: { fontFamily: F.sansReg, fontSize: 22, color: C.midGray },
  // Language picker modal
  langPickerCard: {
    backgroundColor: C.cream, borderRadius: 16, padding: 24,
    width: '100%', gap: 0,
  },
  langPickerTitle: { fontFamily: F.serifReg, fontSize: 22, color: C.ink, marginBottom: 16 },
  langPickerDivider: { height: 1, backgroundColor: C.rule, marginBottom: 8 },
  langPickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.rule,
  },
  langPickerRowActive: { backgroundColor: C.burgPale },
  langPickerEmoji: { fontSize: 28 },
  langPickerFlag: { width: 28, height: 19, borderRadius: 2 },
  langPickerLabel: { flex: 1, fontFamily: F.sansMed, fontSize: 16, color: C.ink },
  langPickerLabelActive: { color: C.burg },
  langPickerCheck: { fontFamily: F.sansMed, fontSize: 16, color: C.burg },
  langPickerCancel: {
    height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  langPickerCancelText: { fontFamily: F.sansReg, fontSize: 14, color: C.midGray },
  passCard: {
    backgroundColor: C.warmWhite, borderWidth: 1, borderColor: C.rule,
    borderRadius: 4, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 18,
    marginBottom: 16, alignItems: 'center',
  },
  creditsCardLabel: {
    fontFamily: F.sansMed, fontSize: 9, color: C.midGray,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12, alignSelf: 'flex-start',
  },
  qrWrapper: {
    marginVertical: 20, padding: 12, backgroundColor: C.warmWhite,
    borderRadius: 4, borderWidth: 1, borderColor: C.rule,
  },
  passName: { fontFamily: F.serifBold, fontSize: 18, color: C.ink, marginBottom: 4, textAlign: 'center' },
  passType: {
    fontFamily: F.sansReg, fontSize: 12, color: C.midGray,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4, textAlign: 'center',
  },
  walletBtn: {
    height: 44, backgroundColor: C.burg, borderRadius: 2,
    alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginTop: 16,
  },
  walletBtnText: { fontFamily: F.sansMed, fontSize: 11, color: C.cream, letterSpacing: 2, textTransform: 'uppercase' },
  btnDisabled: { opacity: 0.5 },
  notifSection: {
    backgroundColor: C.warmWhite, borderWidth: 1, borderColor: C.rule,
    borderRadius: 4, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 18, marginBottom: 16,
  },
  notifGroupLabel: {
    fontFamily: F.sansMed, fontSize: 9, color: C.midGray,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, marginTop: 4,
  },
  notifRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.rule,
  },
  notifLabel: { fontFamily: F.sansReg, fontSize: 14, color: C.ink },
  notifDisabled: { color: C.lightGray },
  notifComingSoon: { fontFamily: F.sansReg, fontSize: 11, color: C.lightGray, marginTop: 10, fontStyle: 'italic' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: C.cream, borderRadius: 16, padding: 28,
    width: '100%', alignItems: 'center', gap: 12,
  },
  modalIconCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: C.burg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  modalIconText: { color: C.cream, fontSize: 24, lineHeight: 28 },
  modalTitle: { fontFamily: F.serifReg, fontSize: 22, color: C.ink, textAlign: 'center' },
  modalBody: { fontFamily: F.sansReg, fontSize: 14, color: C.ink, lineHeight: 21, textAlign: 'center' },
  modalBtn: {
    height: 50, backgroundColor: C.burg, borderRadius: 2,
    alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  modalBtnText: { fontFamily: F.sansMed, fontSize: 11, color: C.cream, letterSpacing: 2, textTransform: 'uppercase' },
  noThanksBtn: { height: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  noThanksBtnText: { fontFamily: F.sansReg, fontSize: 14, color: C.midGray },
  modalSheetSafe: { flex: 1, backgroundColor: C.cream },
  modalSheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.rule,
  },
  modalSheetTitle: { fontFamily: F.serifReg, fontSize: 20, color: C.ink },
  modalSheetCancel: { fontFamily: F.sansReg, fontSize: 14, color: C.midGray },
  modalSheetSave: { fontFamily: F.sansMed, fontSize: 14, color: C.burg },
  modalSheetBody: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48 },
  editFieldLabel: {
    fontFamily: F.sansMed, fontSize: 9, color: C.midGray,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, marginTop: 20,
  },
  editInput: {
    borderWidth: 1, borderColor: C.rule, borderRadius: 4,
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: F.sansReg, fontSize: 14, color: C.ink,
    backgroundColor: C.warmWhite,
  },
  editInputMultiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 },
  editError: { fontFamily: F.sansReg, fontSize: 12, color: C.red, marginTop: 12 },
  dobDisplayBtn: {
    borderWidth: 1, borderColor: C.rule, borderRadius: 4,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: C.warmWhite,
  },
  dobDisplayText: { fontFamily: F.sansReg, fontSize: 14, color: C.ink },
  conditionsEditRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: C.rule, borderRadius: 4,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: C.warmWhite,
  },
  conditionsEditValue: { flex: 1, fontFamily: F.sansReg, fontSize: 14, color: C.ink },
  conditionsEditChevron: { fontSize: 20, color: C.midGray, marginLeft: 8 },
  condQuestion: {
    fontFamily: F.sansMed, fontSize: 10, color: C.midGray,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12,
  },
  yesNoRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  yesNoBtn: {
    flex: 1, height: 44, borderWidth: 1, borderColor: C.rule,
    borderRadius: 2, alignItems: 'center', justifyContent: 'center',
  },
  yesNoBtnActive: { borderColor: C.burg, backgroundColor: C.burg },
  yesNoText: { fontFamily: F.sansMed, fontSize: 12, color: C.ink, letterSpacing: 2 },
  yesNoTextActive: { color: C.cream },
  conditionsGrid: { marginBottom: 16 },
  selectAllLabel: {
    fontFamily: F.sansMed, fontSize: 9, color: C.midGray,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10,
  },
  conditionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  conditionChip: {
    borderWidth: 1, borderColor: C.rule, borderRadius: 2,
    paddingHorizontal: 12, paddingVertical: 10, width: '47%',
  },
  conditionChipWide: {
    borderWidth: 1, borderColor: C.rule, borderRadius: 2,
    paddingHorizontal: 12, paddingVertical: 10, width: '100%',
  },
  conditionChipActive: { borderColor: C.burg, backgroundColor: C.burgPale },
  conditionText: { fontFamily: F.sansReg, fontSize: 13, color: C.ink },
  conditionTextActive: { color: C.burg, fontFamily: F.sansMed },
  otherInput: {
    width: '100%', height: 44, borderWidth: 1, borderColor: C.rule,
    borderRadius: 2, paddingHorizontal: 12, fontFamily: F.sansReg,
    fontSize: 14, color: C.ink, backgroundColor: C.warmWhite, marginTop: 4,
  },
  condError: { fontFamily: F.sansReg, fontSize: 12, color: C.red, marginBottom: 12 },
  sheetSaveBtn: {
    height: 50, backgroundColor: C.burg, borderRadius: 2,
    alignItems: 'center', justifyContent: 'center', marginTop: 24,
  },
  sheetSaveBtnText: { fontFamily: F.sansMed, fontSize: 11, color: C.cream, letterSpacing: 2, textTransform: 'uppercase' },
  subCard: {
    backgroundColor: C.cream, borderWidth: 1, borderColor: C.rule,
    borderRadius: 3, padding: 14, marginBottom: 10,
  },
  subCardHeader: { fontFamily: F.sansMed, fontSize: 10, color: C.midGray, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  subCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  subName: { fontFamily: F.serifBold, fontSize: 20, color: C.ink, flex: 1, marginRight: 8 },
  subMeta: { fontFamily: F.sansMed, fontSize: 10, color: C.burg, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 2 },
  subStatusBadge: { paddingLeft: 8 },
  subStatusText: { fontFamily: F.sansMed, fontSize: 10, color: C.green, letterSpacing: 0.5, textTransform: 'uppercase' },
  subStatusPastDue: { color: C.red },
  subStatusCancelling: { color: C.midGray },
  subCredits: { fontFamily: F.sansReg, fontSize: 12, color: C.midGray, marginBottom: 2 },
  subRenewal: { fontFamily: F.sansReg, fontSize: 12, color: C.midGray },
  subPricePill: {},
  subPricePillText: { fontFamily: F.serifBold, fontSize: 32, color: C.burg },
  subPricePillPer: { fontFamily: F.sansReg, fontSize: 13, color: C.midGray },
  subClassCount: { fontFamily: F.sansReg, fontSize: 12, color: C.midGray, marginTop: 2 },
  subPrice: { fontFamily: F.serifBold, fontSize: 20, color: C.ink },
  subPricePer: { fontFamily: F.sansReg, fontSize: 12, color: C.midGray },
  subPricePerClass: { fontFamily: F.sansReg, fontSize: 11, color: C.midGray, marginTop: 1 },
  billingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  billingPillDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  billingPillText: { fontFamily: F.sansMed, fontSize: 11, letterSpacing: 0.5 },
  changePlanBtn: {
    backgroundColor: C.burg,
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  changePlanBtnText: { fontFamily: F.sansMed, fontSize: 12, color: C.cream, letterSpacing: 1.5, textTransform: 'uppercase' },
  cancelPlanBtn: {
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelPlanBtnText: { fontFamily: F.sansMed, fontSize: 12, color: C.midGray, letterSpacing: 1.5 },
  pendingPlanNote: {
    backgroundColor: '#FFF3CD',
    borderRadius: 4,
    padding: 12,
    marginBottom: 10,
  },
  pendingPlanNoteText: { fontFamily: F.sansReg, fontSize: 12, color: '#856404' },
  pastDueHint: { fontFamily: F.sansReg, fontSize: 12, color: C.red, marginBottom: 10 },
  subCancelLink: { marginTop: 10, alignSelf: 'flex-start' },
  subCancelLinkText: { fontFamily: F.sansMed, fontSize: 12, color: C.burg, textDecorationLine: 'underline' },
  studentToggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.warmWhite, borderWidth: 1, borderColor: C.rule,
    borderRadius: 4, paddingHorizontal: 16, paddingVertical: 14, marginTop: 12,
  },
  studentToggleLabel: { fontFamily: F.sansMed, fontSize: 13, color: C.ink, letterSpacing: 0.3 },
  studentToggleSub: { fontFamily: F.sansReg, fontSize: 11, color: C.midGray, marginTop: 2 },
  giftBtn: {
    backgroundColor: C.warmWhite, borderWidth: 1, borderColor: C.rule,
    borderRadius: 4, paddingHorizontal: 16, paddingVertical: 14,
    marginTop: 12, alignItems: 'center',
  },
  giftBtnText: { fontFamily: F.sansMed, fontSize: 13, color: C.burg, letterSpacing: 0.3 },
  giftOption: {
    width: '100%', borderWidth: 1, borderColor: C.rule,
    borderRadius: 4, padding: 12, marginTop: 4,
  },
  giftOptionSelected: { borderColor: C.burg, backgroundColor: C.warmWhite },
  giftOptionName: { fontFamily: F.sansMed, fontSize: 14, color: C.ink },
  giftOptionNameSelected: { color: C.burg },
  giftOptionMeta: { fontFamily: F.sansReg, fontSize: 12, color: C.midGray, marginTop: 2 },
  modalConfirmBtn: {
    height: 48, backgroundColor: C.ink, borderRadius: 4,
    alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  modalConfirmBtnText: { fontFamily: F.sansMed, fontSize: 13, color: C.cream, letterSpacing: 1 },
  modalCancelBtn: { height: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  modalCancelBtnText: { fontFamily: F.sansReg, fontSize: 14, color: C.midGray },
  // ─── Danger Zone ───────────────────────────────────────────────────────────
  dangerZone: {
    marginTop: 32, borderWidth: 1, borderColor: `${C.red}40`,
    borderRadius: 4, padding: 16,
  },
  dangerZoneTitle: {
    fontFamily: F.sansMed, fontSize: 10, color: C.red,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6,
  },
  dangerZoneDesc: {
    fontFamily: F.sansReg, fontSize: 12, color: C.midGray, marginBottom: 14, lineHeight: 18,
  },
  deleteAccountBtn: {
    height: 44, borderWidth: 1, borderColor: C.red,
    borderRadius: 2, alignItems: 'center', justifyContent: 'center',
  },
  deleteAccountBtnText: {
    fontFamily: F.sansMed, fontSize: 11, color: C.red, letterSpacing: 2, textTransform: 'uppercase',
  },
  // ─── Delete confirmation modal ─────────────────────────────────────────────
  deleteModalCard: {
    backgroundColor: C.cream, borderRadius: 6, padding: 24, width: '90%', maxWidth: 380,
  },
  deleteModalTitle: {
    fontFamily: F.serifBold, fontSize: 20, color: C.ink, marginBottom: 16,
  },
  deletePreviewItem: { marginBottom: 12 },
  deletePreviewLabel: {
    fontFamily: F.sansMed, fontSize: 9, color: C.midGray,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4,
  },
  deletePreviewValue: { fontFamily: F.sansReg, fontSize: 13, color: C.ink, lineHeight: 20 },
  deleteConfirmPrompt: {
    fontFamily: F.sansMed, fontSize: 11, color: C.ink, letterSpacing: 0.5, marginTop: 16, marginBottom: 8,
  },
  deleteConfirmInput: {
    height: 44, borderWidth: 1, borderColor: C.rule, borderRadius: 2,
    paddingHorizontal: 12, fontFamily: F.sansReg, fontSize: 14,
    color: C.ink, backgroundColor: C.warmWhite, marginBottom: 16,
  },
  deleteConfirmBtn: {
    height: 48, backgroundColor: C.red, borderRadius: 2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  deleteConfirmBtnText: {
    fontFamily: F.sansMed, fontSize: 11, color: C.cream, letterSpacing: 2, textTransform: 'uppercase',
  },
})
