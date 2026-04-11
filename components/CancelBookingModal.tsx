import { View, Text, TouchableOpacity, Modal, StyleSheet, ActivityIndicator } from 'react-native'
import { differenceInMinutes } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { C, F } from '@/constants/theme'

type Props = {
  visible: boolean
  classStartsAt: string
  loading: boolean
  onKeep: () => void
  onConfirm: () => void
}

export default function CancelBookingModal({ visible, classStartsAt, loading, onKeep, onConfirm }: Props) {
  const { t } = useTranslation()
  const minutesUntilClass = differenceInMinutes(new Date(classStartsAt), new Date())
  const isLate = minutesUntilClass < 60

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onKeep}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('classes.cancelTitle')}</Text>
          <View style={styles.divider} />

          {isLate ? (
            <Text style={styles.body}>
              {t('classes.cancelWarning', { hours: 1 })}
            </Text>
          ) : (
            <Text style={styles.body}>
              {t('classes.creditReturned')}
            </Text>
          )}

          <TouchableOpacity style={styles.keepBtn} onPress={onKeep} disabled={loading}>
            <Text style={styles.keepBtnText}>{t('classes.keepBooking')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.cancelBtn, loading && styles.btnDisabled]}
            onPress={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={C.cream} />
            ) : (
              <Text style={styles.cancelBtnText}>{t('classes.cancelClass')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.cream,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 40,
  },
  title: {
    fontFamily: F.serifBold,
    fontSize: 22,
    color: C.ink,
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: C.rule,
    marginBottom: 16,
  },
  body: {
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.midGray,
    lineHeight: 22,
    marginBottom: 28,
  },
  keepBtn: {
    height: 50,
    borderWidth: 1,
    borderColor: C.ink,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  keepBtnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.ink,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  cancelBtn: {
    height: 50,
    backgroundColor: C.red,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.cream,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  btnDisabled: {
    opacity: 0.6,
  },
})
