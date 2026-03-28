import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as SecureStore from 'expo-secure-store'
import * as Sharing from 'expo-sharing'
import { api } from '@/lib/api'
import { API_BASE_URL } from '@/constants/api'
import { C, F } from '@/constants/theme'

type Props = {
  visible: boolean
  userId: string
  initialQrCode?: string | null
  onDismiss: () => void
}

export default function WalletModal({ visible, userId, initialQrCode, onDismiss }: Props) {
  const [qrCode, setQrCode] = useState<string | null>(initialQrCode ?? null)
  const [loading, setLoading] = useState(false)
  const [walletLoading, setWalletLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (visible && !qrCode) generateQr()
  }, [visible])

  async function generateQr() {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/api/user/generate-qr')
      setQrCode(data.qrCode)
    } catch {
      setError('Could not generate your pass. You can add it later from your profile.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddToAppleWallet() {
    if (!qrCode) return
    setWalletLoading(true)
    setError('')
    try {
      const token = await SecureStore.getItemAsync('access_token')
      const fileUri = FileSystem.cacheDirectory + 'ooma-class-pass.pkpass'
      await FileSystem.downloadAsync(
        `${API_BASE_URL}/api/wallet/apple`,
        fileUri,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.apple.pkpass',
        UTI: 'com.apple.pkpass',
      })
    } catch {
      setError('Could not generate your pass. You can add it later from your profile.')
    } finally {
      setWalletLoading(false)
    }
  }

  async function handleAddToGoogleWallet() {
    if (!qrCode) return
    setWalletLoading(true)
    setError('')
    try {
      const { data } = await api.get('/api/wallet/google')
      await Linking.openURL(data.saveUrl)
    } catch {
      setError('Could not generate your pass. You can add it later from your profile.')
    } finally {
      setWalletLoading(false)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Handle bar */}
          <View style={styles.handle} />

          {/* Logo placeholder / illustration */}
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>O</Text>
          </View>

          <Text style={styles.heading}>Add your Class Pass{'\n'}to your wallet</Text>
          <Text style={styles.subtext}>
            Show this at the studio to check in to any class.
          </Text>

          {loading ? (
            <ActivityIndicator size="large" color={C.burg} style={styles.loader} />
          ) : error ? (
            <>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={onDismiss}>
                <Text style={styles.primaryBtnText}>GO TO HOME</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {Platform.OS === 'ios' ? (
                <TouchableOpacity
                  style={[styles.primaryBtn, walletLoading && styles.btnDisabled]}
                  onPress={handleAddToAppleWallet}
                  disabled={walletLoading}
                >
                  {walletLoading
                    ? <ActivityIndicator size="small" color={C.cream} />
                    : <Text style={styles.primaryBtnText}>ADD TO APPLE WALLET</Text>
                  }
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryBtn, walletLoading && styles.btnDisabled]}
                  onPress={handleAddToGoogleWallet}
                  disabled={walletLoading}
                >
                  {walletLoading
                    ? <ActivityIndicator size="small" color={C.cream} />
                    : <Text style={styles.primaryBtnText}>ADD TO GOOGLE WALLET</Text>
                  }
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={onDismiss} style={styles.laterBtn}>
                <Text style={styles.laterText}>Maybe Later</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(26, 21, 18, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.cream,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 28,
    paddingTop: 12,
    paddingBottom: 48,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.rule,
    marginBottom: 28,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.burg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoText: {
    fontFamily: F.serifBold,
    fontSize: 36,
    color: C.cream,
    lineHeight: 40,
  },
  heading: {
    fontFamily: F.serifBold,
    fontSize: 26,
    color: C.ink,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 32,
  },
  subtext: {
    fontFamily: F.sansReg,
    fontSize: 13,
    color: C.midGray,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  loader: {
    marginVertical: 24,
  },
  errorText: {
    fontFamily: F.sansReg,
    fontSize: 13,
    color: C.red,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  primaryBtn: {
    height: 50,
    backgroundColor: C.ink,
    borderRadius: 2,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  primaryBtnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.cream,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  laterBtn: {
    paddingVertical: 8,
  },
  laterText: {
    fontFamily: F.sansReg,
    fontSize: 13,
    color: C.midGray,
    textDecorationLine: 'underline',
  },
  btnDisabled: {
    opacity: 0.5,
  },
})
