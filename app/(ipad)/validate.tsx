import { useRef, useState } from 'react'
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { C, F } from '@/constants/theme'

type ScreenState = 'idle' | 'scanning' | 'success' | 'error'
type ErrorKey = 'QR_NOT_FOUND' | 'NO_BOOKING_TODAY' | 'UNKNOWN'

type SuccessData = { memberName: string; className: string }

export default function ValidateScreen() {
  const { t } = useTranslation()
  const [permission, requestPermission] = useCameraPermissions()
  const [screenState, setScreenState] = useState<ScreenState>('idle')
  const [successData, setSuccessData] = useState<SuccessData | null>(null)
  const [errorKey, setErrorKey] = useState<ErrorKey>('UNKNOWN')
  const processingRef = useRef(false)

  async function handleScanPress() {
    if (!permission?.granted) {
      const result = await requestPermission()
      if (!result.granted) return
    }
    processingRef.current = false
    setScreenState('scanning')
  }

  async function handleBarcodeScan({ data }: { data: string }) {
    if (processingRef.current) return
    processingRef.current = true
    setScreenState('idle')

    try {
      const res = await api.post('/api/mobile/attendance/validate', { qrCode: data })
      setSuccessData(res.data)
      setScreenState('success')
    } catch (err: any) {
      const code = err?.response?.data?.error
      setErrorKey(code === 'QR_NOT_FOUND' || code === 'NO_BOOKING_TODAY' ? code : 'UNKNOWN')
      setScreenState('error')
    }

    setTimeout(() => {
      setScreenState('idle')
      setSuccessData(null)
    }, 3000)
  }

  if (screenState === 'success' && successData) {
    return (
      <View style={[s.fill, s.resultContainer, { backgroundColor: C.green }]}>
        <Text style={s.resultIcon}>✓</Text>
        <Text style={s.resultName}>{successData.memberName}</Text>
        <Text style={s.resultClass}>{successData.className}</Text>
      </View>
    )
  }

  if (screenState === 'error') {
    return (
      <View style={[s.fill, s.resultContainer, { backgroundColor: C.red }]}>
        <Text style={s.resultIcon}>✕</Text>
        <Text style={s.resultErrorMsg}>{t(`ipad.errors.${errorKey}`)}</Text>
      </View>
    )
  }

  return (
    <SafeAreaView style={s.fill}>
      <View style={s.container}>
        <Image source={require('@/assets/icon.png')} style={s.logo} resizeMode="contain" />
        <TouchableOpacity style={s.btn} onPress={handleScanPress} activeOpacity={0.85}>
          <Text style={s.btnText}>{t('ipad.validateButton')}</Text>
        </TouchableOpacity>
        <Text style={s.clubLabel}>{t('ipad.clubLabel')}</Text>
      </View>

      <Modal visible={screenState === 'scanning'} animationType="slide">
        <View style={s.fill}>
          <CameraView
            style={s.fill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleBarcodeScan}
          />
          <TouchableOpacity style={s.cancelBtn} onPress={() => setScreenState('idle')}>
            <Text style={s.cancelBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  fill: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: C.cream,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    paddingHorizontal: 40,
  },
  logo: {
    width: 120,
    height: 120,
  },
  btn: {
    backgroundColor: C.burg,
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  btnText: {
    fontFamily: F.sansMed,
    fontSize: 16,
    color: '#fff',
    letterSpacing: 0.5,
  },
  clubLabel: {
    fontFamily: F.sans,
    fontSize: 12,
    color: C.midGray,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  resultContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 40,
  },
  resultIcon: {
    fontSize: 80,
    color: '#fff',
  },
  resultName: {
    fontFamily: F.serifBold,
    fontSize: 36,
    color: '#fff',
    textAlign: 'center',
  },
  resultClass: {
    fontFamily: F.sans,
    fontSize: 18,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
  resultErrorMsg: {
    fontFamily: F.sansMed,
    fontSize: 20,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 30,
  },
  cancelBtn: {
    position: 'absolute',
    top: 60,
    right: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: F.sansMed,
  },
})
