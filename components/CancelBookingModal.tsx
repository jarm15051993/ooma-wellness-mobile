import { View, Text, TouchableOpacity, Modal, StyleSheet, ActivityIndicator } from 'react-native'
import { differenceInMinutes } from 'date-fns'
import { C, F } from '@/constants/theme'

type Props = {
  visible: boolean
  classStartsAt: string
  loading: boolean
  onKeep: () => void
  onConfirm: () => void
}

export default function CancelBookingModal({ visible, classStartsAt, loading, onKeep, onConfirm }: Props) {
  const minutesUntilClass = differenceInMinutes(new Date(classStartsAt), new Date())
  const isLate = minutesUntilClass < 60

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onKeep}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Cancel this class?</Text>
          <View style={styles.divider} />

          {isLate ? (
            <Text style={styles.body}>
              This class starts in less than 1 hour. If you cancel now, you will lose this class credit and it will not be returned to your package.
            </Text>
          ) : (
            <Text style={styles.body}>
              Your class credit will be returned to your package.
            </Text>
          )}

          <TouchableOpacity style={styles.keepBtn} onPress={onKeep} disabled={loading}>
            <Text style={styles.keepBtnText}>{isLate ? "DON'T CANCEL" : 'KEEP BOOKING'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.cancelBtn, loading && styles.btnDisabled]}
            onPress={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={C.cream} />
            ) : (
              <Text style={styles.cancelBtnText}>
                {isLate ? 'CANCEL ANYWAY — LOSE CREDIT' : 'CANCEL CLASS'}
              </Text>
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
