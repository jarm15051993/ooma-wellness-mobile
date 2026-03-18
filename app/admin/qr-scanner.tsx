import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Animated,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { api } from '@/lib/api'
import { C, F } from '@/constants/theme'

type Attendee = {
  bookingId: string
  status: string
  stretcherNumber: number
  user: { id: string; fullName: string; goals: string | null; healthConditions: string | null }
}

type OverlayState = {
  visible: boolean
  message: string
  color: string
}

export default function QrScannerScreen() {
  const { classId, attendees: attendeesJson } = useLocalSearchParams<{
    classId: string
    attendees: string
  }>()
  const router = useRouter()

  const attendees: Attendee[] = attendeesJson ? JSON.parse(attendeesJson) : []

  const [permission, requestPermission] = useCameraPermissions()
  const [paused, setPaused] = useState(false)
  const [overlay, setOverlay] = useState<OverlayState>({ visible: false, message: '', color: '#15803D' })
  const overlayOpacity = useRef(new Animated.Value(0)).current
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
    }
  }, [])

  function showOverlay(message: string, color: string, closeAfter = false) {
    setOverlay({ visible: true, message, color })
    Animated.timing(overlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start()
    dismissTimer.current = setTimeout(() => {
      Animated.timing(overlayOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setOverlay((o) => ({ ...o, visible: false }))
        if (closeAfter) {
          router.back()
        } else {
          setPaused(false)
        }
      })
    }, 3000)
  }

  async function handleBarcodeScan({ data: qrCode }: { data: string }) {
    if (paused) return
    setPaused(true)

    try {
      // Resolve userId from QR code
      const { data: qrData } = await api.get(`/api/admin/users/by-qr?code=${qrCode}`)
      const { userId, fullName } = qrData

      // Match to bookingId in local attendee list
      const attendee = attendees.find((a) => a.user.id === userId)
      if (!attendee) {
        showOverlay('User not registered in this class.', '#DC2626')
        return
      }

      // Call validate endpoint
      const { data: validateData } = await api.patch(
        `/api/admin/bookings/${attendee.bookingId}/validate`,
        { classId }
      )

      if (validateData.alreadyValidated) {
        showOverlay('Already validated ✓', '#2563EB')
      } else {
        showOverlay(
          `Attendance confirmed ✓\n${fullName}, Reformer ${attendee.stretcherNumber}`,
          '#15803D',
          true
        )
      }
    } catch (err: any) {
      const msg = err.response?.data?.error ?? ''
      if (msg.includes('Validation is only available')) {
        showOverlay('Validation window not open yet.', '#DC2626')
      } else if (err.response?.status === 404) {
        showOverlay('User not registered in this class.', '#DC2626')
      } else {
        showOverlay('Something went wrong. Try again.', '#DC2626')
      }
    }
  }

  // Permission not yet determined
  if (!permission) {
    return <SafeAreaView style={styles.centered} />
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.permText}>
          Camera permission is required to scan QR codes.
        </Text>
        <TouchableOpacity style={styles.settingsBtn} onPress={() => Linking.openSettings()}>
          <Text style={styles.settingsBtnText}>OPEN SETTINGS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.requestBtn} onPress={requestPermission}>
          <Text style={styles.requestBtnText}>Allow Camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        onBarcodeScanned={paused ? undefined : handleBarcodeScan}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />

      {/* Dark overlay with scan frame cutout */}
      <View style={styles.overlay}>
        <View style={styles.overlayTop} />
        <View style={styles.overlayMiddle}>
          <View style={styles.overlaySide} />
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <View style={styles.overlaySide} />
        </View>
        <View style={styles.overlayBottom}>
          <Text style={styles.hintText}>Align QR code within the frame</Text>
        </View>
      </View>

      {/* Back / Done button */}
      <SafeAreaView style={styles.topBar} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => router.back()}
        >
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* Result overlay */}
      {overlay.visible && (
        <Animated.View
          style={[styles.resultOverlay, { opacity: overlayOpacity, backgroundColor: overlay.color }]}
        >
          <Text style={styles.resultText}>{overlay.message}</Text>
        </Animated.View>
      )}
    </View>
  )
}

const FRAME = 240
const CORNER = 24

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: {
    flex: 1,
    backgroundColor: C.cream,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  permText: {
    fontFamily: F.sansReg,
    fontSize: 15,
    color: C.ink,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  settingsBtn: {
    height: 44,
    backgroundColor: C.ink,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    marginBottom: 12,
    width: '100%',
  },
  settingsBtnText: { fontFamily: F.sansMed, fontSize: 11, color: C.cream, letterSpacing: 2 },
  requestBtn: {
    height: 44,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  requestBtnText: { fontFamily: F.sansMed, fontSize: 12, color: C.ink },
  overlay: { ...StyleSheet.absoluteFillObject, flexDirection: 'column' },
  overlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  overlayMiddle: { flexDirection: 'row', height: FRAME },
  overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    paddingTop: 24,
  },
  scanFrame: {
    width: FRAME,
    height: FRAME,
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: '#FFFFFF',
    borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  hintText: {
    fontFamily: F.sansReg,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.3,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  doneBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  doneBtnText: {
    fontFamily: F.sansMed,
    fontSize: 16,
    color: '#FFFFFF',
  },
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  resultText: {
    fontFamily: F.sansMed,
    fontSize: 22,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 32,
  },
})
