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
import QRCode from 'react-native-qrcode-svg'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { C, F } from '@/constants/theme'
import { API_BASE_URL } from '@/constants/api'
import WalletModal from '@/components/WalletModal'
import Toast from '@/components/Toast'
import { consumePendingWalletToast } from '@/lib/pendingToast'
import { CONDITIONS } from '@/constants/onboarding'

type NotifType = 'booking_confirmation' | 'booking_cancellation' | 'package_purchase'
type NotifPrefs = Record<NotifType, boolean>

const NOTIF_LABELS: Record<NotifType, string> = {
  booking_confirmation: 'Class Booked',
  booking_cancellation: 'Booking Cancelled',
  package_purchase: 'Package Purchase',
}

type EditableField = 'name' | 'lastName' | 'phone' | 'dob' | 'goals'

type ExtendedProfile = {
  birthday: string | null
  goals: string | null
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

function validatePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) return 'Please enter a valid phone number.'
  return null
}

function PackageCard({ pkg, muted }: { pkg: UserPackage; muted: boolean }) {
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

  return (
    <View style={[styles.packageCard, muted && styles.packageCardMuted]}>
      <View style={styles.packageCardTop}>
        <Text style={[styles.packageName, muted && styles.mutedText]}>{pkg.name}</Text>
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
}

export default function ProfileScreen() {
  const router = useRouter()
  const { user, signOut, refreshUser, tenantUser, isAdmin, isOwner } = useAuth()
  const isStaff = isAdmin || isOwner
  const [activePackages, setActivePackages] = useState<UserPackage[]>([])
  const [expiredPackages, setExpiredPackages] = useState<UserPackage[]>([])
  const [loadingPackages, setLoadingPackages] = useState(true)
  const [showExpired, setShowExpired] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoVersion, setPhotoVersion] = useState(Date.now())
  const [qrCode, setQrCode] = useState<string | null>(user?.qrCode ?? null)
  const [walletLoading, setWalletLoading] = useState(false)
  const [showWalletModal, setShowWalletModal] = useState(false)
  const [showWalletSuccessModal, setShowWalletSuccessModal] = useState(false)
  const [showActive, setShowActive] = useState(false)
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({
    booking_confirmation: true,
    booking_cancellation: true,
    package_purchase: true,
  })
  const [savingNotif, setSavingNotif] = useState<NotifType | null>(null)
  const [notifToast, setNotifToast] = useState({ visible: false, message: '', isError: false })

  // Extended profile state (birthday, goals, additionalInfo)
  const [extProfile, setExtProfile] = useState<ExtendedProfile>({ birthday: null, goals: null, additionalInfo: null })

  // Inline edit state
  const [editingField, setEditingField] = useState<EditableField | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showDobPicker, setShowDobPicker] = useState(false)
  const [dobPickerDate, setDobPickerDate] = useState(new Date())

  // Medical conditions modal
  const [showConditionsModal, setShowConditionsModal] = useState(false)
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

  useFocusEffect(
    useCallback(() => {
      async function fetchPackages() {
        setLoadingPackages(true)
        try {
          const { data } = await api.get('/api/user/packages')
          setActivePackages(data.active)
          setExpiredPackages(data.expired)
        } catch (err: any) {
          if (err.response?.status !== 401) {
            Alert.alert('Error', err.response?.data?.error ?? 'Failed to load packages')
          }
        } finally {
          setLoadingPackages(false)
        }
      }
      fetchPackages()
    }, [])
  )

  // Fetch extended profile (birthday, goals, conditions) — students only
  useFocusEffect(
    useCallback(() => {
      if (isStaff) return
      api.get('/api/user/profile')
        .then(({ data }) => {
          setExtProfile({
            birthday: data.user.birthday ?? null,
            goals: data.user.goals ?? null,
            additionalInfo: data.user.additionalInfo ?? null,
          })
        })
        .catch(() => {/* silently ignore */})
    }, [isStaff])
  )

  useFocusEffect(
    useCallback(() => {
      if (consumePendingWalletToast()) setShowWalletSuccessModal(true)
    }, [])
  )

  useFocusEffect(
    useCallback(() => {
      if (isStaff) return
      api.get('/api/mobile/notification-preferences')
        .then(({ data }) => {
          const prefs = { ...notifPrefs }
          for (const p of data.preferences) prefs[p.type as NotifType] = p.enabled
          setNotifPrefs(prefs)
        })
        .catch(() => {})
    }, [isStaff])
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

  // ─── Edit helpers ───────────────────────────────────────────────────────────

  function startEdit(field: EditableField) {
    if (editingField && editingField !== field) {
      Alert.alert('Unsaved Changes', 'Discard your unsaved changes?', [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => openEditField(field) },
      ])
      return
    }
    openEditField(field)
  }

  function openEditField(field: EditableField) {
    setEditError('')
    setEditingField(field)
    if (field === 'name') setEditValue(user?.name ?? '')
    else if (field === 'lastName') setEditValue(user?.lastName ?? '')
    else if (field === 'phone') setEditValue(user?.phone ?? '')
    else if (field === 'goals') setEditValue(extProfile.goals ?? '')
    else if (field === 'dob') {
      const d = extProfile.birthday ? new Date(extProfile.birthday) : new Date(2000, 0, 1)
      setDobPickerDate(d)
      setEditValue(extProfile.birthday ?? '')
      setShowDobPicker(true)
    }
  }

  function cancelEdit() {
    setEditingField(null)
    setEditValue('')
    setEditError('')
    setShowDobPicker(false)
  }

  function validateEdit(field: EditableField, value: string): string | null {
    if (field === 'name' || field === 'lastName') {
      if (!value.trim()) return `Please enter your ${field === 'name' ? 'first' : 'last'} name.`
    }
    if (field === 'phone') {
      return validatePhone(value)
    }
    if (field === 'goals') {
      if (!value.trim()) return 'Please tell us your goal.'
    }
    return null
  }

  async function saveField(field: EditableField) {
    const err = validateEdit(field, editValue)
    if (err) { setEditError(err); return }

    setSaving(true)
    try {
      const body: Record<string, string> = { userId: user!.id }
      if (field === 'name') body.name = editValue.trim()
      else if (field === 'lastName') body.lastName = editValue.trim()
      else if (field === 'phone') body.phone = editValue.trim()
      else if (field === 'goals') body.goals = editValue.trim()
      else if (field === 'dob') body.birthday = editValue

      await api.patch('/api/user/update', body)

      if (field === 'goals' || field === 'dob') {
        setExtProfile(p => ({
          ...p,
          goals: field === 'goals' ? editValue.trim() : p.goals,
          birthday: field === 'dob' ? editValue : p.birthday,
        }))
      } else {
        await refreshUser()
      }

      setEditingField(null)
      setEditValue('')
      setEditError('')
      setShowDobPicker(false)
      setNotifToast({ visible: true, message: 'Information Updated', isError: false })
    } catch (e: any) {
      setEditError(e?.response?.data?.error ?? 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ─── Medical conditions modal ───────────────────────────────────────────────

  function openConditionsModal() {
    const { selected, other } = parseConditions(extProfile.additionalInfo)
    setCondHasConditions(selected.length > 0 ? true : extProfile.additionalInfo === null ? null : false)
    setCondSelected(selected)
    setCondOther(other)
    setCondError('')
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
      setNotifToast({ visible: true, message: 'Information Updated', isError: false })
    } catch (e: any) {
      setCondError(e?.response?.data?.error ?? 'Could not save. Please try again.')
    } finally {
      setSavingConditions(false)
    }
  }

  // ─── Email change modal ─────────────────────────────────────────────────────

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

  // ─── Notifications ──────────────────────────────────────────────────────────

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

  // ─── Wallet / photo ─────────────────────────────────────────────────────────

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
    } catch {
      Alert.alert('Error', 'Could not generate your pass. Please try again.')
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

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ])
  }

  const initials = [user?.name, user?.lastName]
    .filter(Boolean)
    .map(s => s!.charAt(0).toUpperCase())
    .join('')

  const maxDob = new Date()
  maxDob.setFullYear(maxDob.getFullYear() - 14)

  // ─── EditableRow component ──────────────────────────────────────────────────

  function EditableRow({
    label, displayValue, field, multiline,
  }: {
    label: string
    displayValue: string | null | undefined
    field: EditableField
    multiline?: boolean
  }) {
    const isEditing = editingField === field

    if (isEditing) {
      const isDob = field === 'dob'
      return (
        <View style={styles.editableRowEdit}>
          <Text style={styles.infoLabel}>{label}</Text>
          {isDob ? (
            <View>
              <TouchableOpacity
                style={styles.dobDisplayBtn}
                onPress={() => setShowDobPicker(v => !v)}
              >
                <Text style={styles.dobDisplayText}>
                  {editValue ? format(new Date(editValue), 'MMMM d, yyyy') : 'Select date'}
                </Text>
              </TouchableOpacity>
              {showDobPicker && (
                <DateTimePicker
                  value={dobPickerDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  maximumDate={maxDob}
                  onChange={(_, d) => {
                    if (Platform.OS === 'android') setShowDobPicker(false)
                    if (d) {
                      setDobPickerDate(d)
                      setEditValue(d.toISOString())
                    }
                  }}
                />
              )}
            </View>
          ) : (
            <TextInput
              style={[styles.editInput, multiline && styles.editInputMultiline, editError ? styles.editInputError : null]}
              value={editValue}
              onChangeText={v => { setEditValue(v); setEditError('') }}
              autoFocus
              multiline={multiline}
              numberOfLines={multiline ? 3 : 1}
              autoCapitalize={field === 'phone' ? 'none' : 'words'}
              keyboardType={field === 'phone' ? 'phone-pad' : 'default'}
            />
          )}
          {editError ? <Text style={styles.editError}>{editError}</Text> : null}
          <View style={styles.editActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={cancelEdit} disabled={saving}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, saving && styles.btnDisabled]} onPress={() => saveField(field)} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={C.cream} />
                : <Text style={styles.saveBtnText}>Save</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      )
    }

    return (
      <View style={styles.infoRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.infoLabel}>{label}</Text>
          <Text style={styles.infoValue}>{displayValue ?? '—'}</Text>
        </View>
        {!isStaff && (
          <TouchableOpacity style={styles.pencilBtn} onPress={() => startEdit(field)}>
            <Text style={styles.pencilIcon}>✎</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  function ConditionsRow() {
    const displayValue = extProfile.additionalInfo
      ? extProfile.additionalInfo
      : extProfile.additionalInfo === null
        ? '—'
        : 'None'

    return (
      <View style={styles.infoRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.infoLabel}>MEDICAL CONDITIONS</Text>
          <Text style={styles.infoValue}>{extProfile.additionalInfo ?? '—'}</Text>
        </View>
        {!isStaff && (
          <TouchableOpacity style={styles.pencilBtn} onPress={openConditionsModal}>
            <Text style={styles.pencilIcon}>✎</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  function EmailRow() {
    return (
      <View style={styles.infoRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.infoLabel}>EMAIL</Text>
          <Text style={styles.infoValue}>{user?.email ?? '—'}</Text>
        </View>
        {!isStaff && (
          <TouchableOpacity style={styles.pencilBtn} onPress={openEmailModal}>
            <Text style={styles.pencilIcon}>✎</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Heading */}
        <View style={styles.headingRow}>
          <Text style={styles.headingRegular}>My </Text>
          <Text style={styles.headingItalic}>Profile</Text>
        </View>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handleChangePhoto} disabled={uploadingPhoto} activeOpacity={0.8}>
            {user?.profilePicture && user?.id ? (
              <Image
                source={{ uri: `${API_BASE_URL}/api/user/profile-picture?userId=${user.id}&v=${photoVersion}` }}
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

        {/* Info card */}
        <View style={styles.infoCard}>
          <EditableRow label="FIRST NAME" displayValue={user?.name} field="name" />
          <View style={styles.rowDivider} />
          <EditableRow label="LAST NAME" displayValue={user?.lastName} field="lastName" />
          <View style={styles.rowDivider} />
          <EmailRow />
          <View style={styles.rowDivider} />
          <EditableRow label="PHONE" displayValue={user?.phone} field="phone" />
          {!isStaff && (
            <>
              <View style={styles.rowDivider} />
              <EditableRow
                label="DATE OF BIRTH"
                displayValue={extProfile.birthday ? format(new Date(extProfile.birthday), 'MMMM d, yyyy') : null}
                field="dob"
              />
              <View style={styles.rowDivider} />
              <EditableRow label="GOALS" displayValue={extProfile.goals} field="goals" multiline />
              <View style={styles.rowDivider} />
              <ConditionsRow />
            </>
          )}
        </View>

        {/* My Packages — hidden for staff */}
        {!isStaff && <View style={styles.packagesSection}>
          <Text style={styles.sectionLabel}>MY PACKAGES</Text>
          <View style={styles.creditsDivider} />

          {!loadingPackages && (
            <View style={styles.totalClassesRow}>
              <Text style={styles.totalClassesNumber}>
                {activePackages.reduce((sum, p) => sum + p.classesRemaining, 0)}
              </Text>
              <Text style={styles.totalClassesLabel}>classes remaining</Text>
            </View>
          )}

          {loadingPackages ? (
            <ActivityIndicator size="small" color={C.burg} style={{ marginVertical: 16 }} />
          ) : activePackages.length === 0 && expiredPackages.length === 0 ? (
            <Text style={styles.emptyPackagesText}>No packages yet.</Text>
          ) : (
            <>
              {activePackages.length > 0 && (
                <>
                  <TouchableOpacity
                    style={styles.showExpiredRow}
                    onPress={() => setShowActive(v => !v)}
                  >
                    <Text style={styles.showExpiredText}>
                      {showActive ? 'Hide active packages' : `Show active packages (${activePackages.length})`}
                    </Text>
                  </TouchableOpacity>
                  {showActive && activePackages.map(pkg => (
                    <PackageCard key={pkg.id} pkg={pkg} muted={false} />
                  ))}
                </>
              )}

              {expiredPackages.length > 0 && (
                <>
                  <TouchableOpacity
                    style={styles.showExpiredRow}
                    onPress={() => setShowExpired(v => !v)}
                  >
                    <Text style={styles.showExpiredText}>
                      {showExpired ? 'Hide expired' : `Show expired (${expiredPackages.length})`}
                    </Text>
                  </TouchableOpacity>
                  {showExpired && expiredPackages.map(pkg => (
                    <PackageCard key={pkg.id} pkg={pkg} muted />
                  ))}
                </>
              )}
            </>
          )}

          <TouchableOpacity style={styles.buyBtn} onPress={() => router.push('/packages')}>
            <Text style={styles.buyBtnText}>BUY MORE CLASSES</Text>
          </TouchableOpacity>
        </View>}

        {/* Class Pass / Wallet card — hidden in tenant mode */}
        {!tenantUser && <View style={styles.passCard}>
          <Text style={styles.creditsCardLabel}>MY CLASS PASS</Text>
          <View style={styles.creditsDivider} />

          {qrCode ? (
            <View style={styles.qrWrapper}>
              <QRCode value={qrCode} size={160} color={C.ink} backgroundColor={C.warmWhite} />
            </View>
          ) : (
            <ActivityIndicator size="small" color={C.burg} style={{ marginVertical: 20 }} />
          )}

          <Text style={styles.passName}>
            {[user?.name, user?.lastName].filter(Boolean).join(' ') || ''}
          </Text>
          <Text style={styles.passType}>Class Pass</Text>

          <View style={[styles.creditsDivider, { marginTop: 16, alignSelf: 'stretch' }]} />

          {Platform.OS === 'ios' ? (
            <TouchableOpacity
              style={[styles.walletBtn, walletLoading && styles.btnDisabled]}
              onPress={handleAddToAppleWallet}
              disabled={walletLoading || !qrCode}
            >
              {walletLoading
                ? <ActivityIndicator size="small" color={C.cream} />
                : <Text style={styles.walletBtnText}>ADD TO APPLE WALLET</Text>
              }
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.walletBtn, walletLoading && styles.btnDisabled]}
              onPress={handleAddToGoogleWallet}
              disabled={walletLoading || !qrCode}
            >
              {walletLoading
                ? <ActivityIndicator size="small" color={C.cream} />
                : <Text style={styles.walletBtnText}>ADD TO GOOGLE WALLET</Text>
              }
            </TouchableOpacity>
          )}
        </View>}

        {/* Notifications — students only */}
        {!isStaff && (
          <View style={styles.notifSection}>
            <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
            <View style={styles.creditsDivider} />

            <Text style={styles.notifGroupLabel}>EMAIL</Text>
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

            <View style={[styles.creditsDivider, { marginTop: 16 }]} />
            <Text style={styles.notifGroupLabel}>PUSH NOTIFICATIONS</Text>
            {[0, 1, 2].map(i => (
              <View key={i} style={styles.notifRow}>
                <Text style={[styles.notifLabel, styles.notifDisabled]}>Coming soon</Text>
                <Switch value={false} disabled trackColor={{ false: C.rule, true: C.rule }} thumbColor={C.lightGray} />
              </View>
            ))}
            <Text style={styles.notifComingSoon}>Push notifications coming in a future update.</Text>
          </View>
        )}

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>SIGN OUT</Text>
        </TouchableOpacity>
      </ScrollView>

      <Toast
        message={notifToast.message}
        visible={notifToast.visible}
        onHide={() => setNotifToast(t => ({ ...t, visible: false }))}
      />

      {/* Wallet success modal */}
      <Modal visible={showWalletSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconCircle}>
              <Text style={styles.modalIconText}>✓</Text>
            </View>
            <Text style={styles.modalTitle}>Pass Added</Text>
            <Text style={styles.modalBody}>
              Your Ooma Pass has been added to your wallet. Show this when entering to class.
            </Text>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setShowWalletSuccessModal(false)}>
              <Text style={styles.modalBtnText}>GOT IT</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Medical Conditions modal */}
      <Modal visible={showConditionsModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSheetSafe}>
          <View style={styles.modalSheetHeader}>
            <TouchableOpacity onPress={() => setShowConditionsModal(false)} disabled={savingConditions}>
              <Text style={styles.modalSheetCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalSheetTitle}>Medical Conditions</Text>
            <TouchableOpacity onPress={saveConditions} disabled={savingConditions}>
              {savingConditions
                ? <ActivityIndicator size="small" color={C.burg} />
                : <Text style={styles.modalSheetSave}>Save</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalSheetBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.condQuestion}>DO YOU HAVE ANY INJURIES OR SPECIAL CONDITIONS?</Text>
            <View style={styles.yesNoRow}>
              <TouchableOpacity
                style={[styles.yesNoBtn, condHasConditions === false && styles.yesNoBtnActive]}
                onPress={() => { setCondHasConditions(false); setCondSelected([]) }}
              >
                <Text style={[styles.yesNoText, condHasConditions === false && styles.yesNoTextActive]}>NO</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.yesNoBtn, condHasConditions === true && styles.yesNoBtnActive]}
                onPress={() => setCondHasConditions(true)}
              >
                <Text style={[styles.yesNoText, condHasConditions === true && styles.yesNoTextActive]}>YES</Text>
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
                : <Text style={styles.sheetSaveBtnText}>SAVE CHANGES</Text>
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
                <TouchableOpacity style={[styles.modalBtn, { marginTop: 8 }]} onPress={() => setShowEmailModal(false)}>
                  <Text style={styles.modalBtnText}>DONE</Text>
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
    borderRadius: 4, marginBottom: 16, overflow: 'hidden',
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
  pencilBtn: { padding: 8 },
  pencilIcon: { fontSize: 16, color: C.midGray },
  rowDivider: { height: 1, backgroundColor: C.rule },
  editableRowEdit: { paddingHorizontal: 18, paddingVertical: 14 },
  editInput: {
    borderWidth: 1, borderColor: C.rule, borderRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10,
    fontFamily: F.sansReg, fontSize: 14, color: C.ink,
    backgroundColor: C.cream, marginTop: 6,
  },
  editInputMultiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 },
  editInputError: { borderColor: C.red },
  editError: { fontFamily: F.sansReg, fontSize: 11, color: C.red, marginTop: 4 },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  cancelBtn: {
    flex: 1, height: 36, borderWidth: 1, borderColor: C.rule,
    borderRadius: 2, alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontFamily: F.sansMed, fontSize: 11, color: C.midGray, letterSpacing: 1 },
  saveBtn: {
    flex: 1, height: 36, backgroundColor: C.burg,
    borderRadius: 2, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { fontFamily: F.sansMed, fontSize: 11, color: C.cream, letterSpacing: 1 },
  dobDisplayBtn: {
    borderWidth: 1, borderColor: C.rule, borderRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10, marginTop: 6,
    backgroundColor: C.cream,
  },
  dobDisplayText: { fontFamily: F.sansReg, fontSize: 14, color: C.ink },
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
  emptyPackagesText: { fontFamily: F.sansReg, fontSize: 13, color: C.midGray, marginBottom: 16 },
  packageCard: {
    backgroundColor: C.cream, borderWidth: 1, borderColor: C.rule,
    borderRadius: 3, padding: 14, marginBottom: 10,
  },
  packageCardMuted: { opacity: 0.6 },
  packageCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  packageName: { fontFamily: F.serifBold, fontSize: 16, color: C.ink, flex: 1 },
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
  buyBtnText: { fontFamily: F.sansMed, fontSize: 11, color: C.cream, letterSpacing: 2, textTransform: 'uppercase' },
  signOutBtn: { height: 48, borderWidth: 1, borderColor: C.burg, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  signOutText: { fontFamily: F.sansMed, fontSize: 11, color: C.burg, letterSpacing: 2, textTransform: 'uppercase' },
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
  // Conditions modal
  modalSheetSafe: { flex: 1, backgroundColor: C.cream },
  modalSheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.rule,
  },
  modalSheetTitle: { fontFamily: F.serifReg, fontSize: 20, color: C.ink },
  modalSheetCancel: { fontFamily: F.sansReg, fontSize: 14, color: C.midGray },
  modalSheetSave: { fontFamily: F.sansMed, fontSize: 14, color: C.burg },
  modalSheetBody: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48 },
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
})
