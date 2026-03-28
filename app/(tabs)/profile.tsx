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
} from 'react-native'
import { format } from 'date-fns'
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
import { consumePendingWalletToast } from '@/lib/pendingToast'

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

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value ?? '—'}</Text>
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
  const { user, signOut, refreshUser, tenantUser } = useAuth()
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

  // Show wallet toast if returning from Apple Wallet flow
  useFocusEffect(
    useCallback(() => {
      if (consumePendingWalletToast()) setShowWalletSuccessModal(true)
    }, [])
  )

  // Silently ensure QR code exists; update local state if it was just generated
  useFocusEffect(
    useCallback(() => {
      if (!user?.qrCode) {
        api.post('/api/user/generate-qr')
          .then(({ data }) => setQrCode(data.qrCode))
          .catch(() => {/* silently ignore — user can retry from wallet section */})
      } else {
        setQrCode(user.qrCode)
      }
    }, [user?.qrCode])
  )

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
          <InfoRow label="FIRST NAME" value={user?.name} />
          <View style={styles.rowDivider} />
          <InfoRow label="LAST NAME" value={user?.lastName} />
          <View style={styles.rowDivider} />
          <InfoRow label="EMAIL" value={user?.email} />
          <View style={styles.rowDivider} />
          <InfoRow label="PHONE" value={user?.phone} />
        </View>

        {/* My Packages */}
        <View style={styles.packagesSection}>
          <Text style={styles.sectionLabel}>MY PACKAGES</Text>
          <View style={styles.creditsDivider} />

          {/* Total classes remaining — always visible */}
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
              {activePackages.map(pkg => (
                <PackageCard key={pkg.id} pkg={pkg} muted={false} />
              ))}

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
        </View>

        {/* Class Pass / Wallet card — hidden in tenant mode */}
        {!tenantUser && <View style={styles.passCard}>
          <Text style={styles.creditsCardLabel}>MY CLASS PASS</Text>
          <View style={styles.creditsDivider} />

          {qrCode ? (
            <View style={styles.qrWrapper}>
              <QRCode
                value={qrCode}
                size={160}
                color={C.ink}
                backgroundColor={C.warmWhite}
              />
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

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>SIGN OUT</Text>
        </TouchableOpacity>
      </ScrollView>
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
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.cream,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 48,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 24,
    marginTop: 8,
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
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: C.rule,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.burgPale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: F.serifBold,
    fontSize: 28,
    color: C.burg,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.burg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.cream,
  },
  avatarEditIcon: {
    fontSize: 13,
    color: C.cream,
    lineHeight: 16,
  },
  infoCard: {
    backgroundColor: C.warmWhite,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    marginBottom: 16,
    overflow: 'hidden',
  },
  infoRow: {
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  infoLabel: {
    fontFamily: F.sansMed,
    fontSize: 9,
    color: C.midGray,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  infoValue: {
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.ink,
  },
  rowDivider: {
    height: 1,
    backgroundColor: C.rule,
  },
  packagesSection: {
    backgroundColor: C.warmWhite,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    marginBottom: 16,
  },
  sectionLabel: {
    fontFamily: F.sansMed,
    fontSize: 9,
    color: C.midGray,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  creditsDivider: {
    height: 1,
    backgroundColor: C.rule,
    alignSelf: 'stretch',
    marginBottom: 12,
  },
  totalClassesRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  totalClassesNumber: {
    fontFamily: F.serifBold,
    fontSize: 56,
    color: C.burg,
    lineHeight: 60,
  },
  totalClassesLabel: {
    fontFamily: F.sansReg,
    fontSize: 11,
    color: C.midGray,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  emptyPackagesText: {
    fontFamily: F.sansReg,
    fontSize: 13,
    color: C.midGray,
    marginBottom: 16,
  },
  packageCard: {
    backgroundColor: C.cream,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 3,
    padding: 14,
    marginBottom: 10,
  },
  packageCardMuted: {
    opacity: 0.6,
  },
  packageCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  packageName: {
    fontFamily: F.serifBold,
    fontSize: 16,
    color: C.ink,
    flex: 1,
  },
  packageCount: {
    fontFamily: F.sansMed,
    fontSize: 12,
    color: C.burg,
  },
  progressBar: {
    height: 4,
    backgroundColor: C.rule,
    borderRadius: 2,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: C.burg,
    borderRadius: 2,
  },
  progressFillMuted: {
    backgroundColor: C.midGray,
  },
  packageExpiry: {
    fontFamily: F.sansReg,
    fontSize: 11,
    color: C.midGray,
  },
  mutedText: {
    color: C.midGray,
  },
  showExpiredRow: {
    paddingVertical: 6,
    marginBottom: 8,
  },
  showExpiredText: {
    fontFamily: F.sansMed,
    fontSize: 12,
    color: C.burg,
    textDecorationLine: 'underline',
  },
  buyBtn: {
    height: 44,
    backgroundColor: C.ink,
    borderRadius: 2,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buyBtnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.cream,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  signOutBtn: {
    height: 48,
    borderWidth: 1,
    borderColor: C.burg,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.burg,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  passCard: {
    backgroundColor: C.warmWhite,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    marginBottom: 16,
    alignItems: 'center',
  },
  qrWrapper: {
    marginVertical: 20,
    padding: 12,
    backgroundColor: C.warmWhite,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.rule,
  },
  passName: {
    fontFamily: F.serifBold,
    fontSize: 18,
    color: C.ink,
    marginBottom: 4,
    textAlign: 'center',
  },
  passType: {
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.midGray,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
    textAlign: 'center',
  },
  walletBtn: {
    height: 44,
    backgroundColor: C.burg,
    borderRadius: 2,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  walletBtnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.cream,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: C.cream,
    borderRadius: 16,
    padding: 28,
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  modalIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.burg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  modalIconText: {
    color: C.cream,
    fontSize: 24,
    lineHeight: 28,
  },
  modalTitle: {
    fontFamily: F.serifReg,
    fontSize: 22,
    color: C.ink,
    textAlign: 'center',
  },
  modalBody: {
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.ink,
    lineHeight: 21,
    textAlign: 'center',
  },
  modalBtn: {
    height: 50,
    backgroundColor: C.burg,
    borderRadius: 2,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  modalBtnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.cream,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
})
