import { useEffect, useRef } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { C, F } from '@/constants/theme'

type Props = {
  visible: boolean
  onClaim: () => void
  onDismiss: () => void
  claiming: boolean
}

export default function WelcomeGiftModal({ visible, onClaim, onDismiss, claiming }: Props) {
  const { t } = useTranslation()
  const opacity = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(0.88)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 7,
          tension: 70,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      opacity.setValue(0)
      scale.setValue(0.88)
    }
  }, [visible])

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <View style={s.overlay}>
        <Animated.View style={[s.card, { opacity, transform: [{ scale }] }]}>
          <Text style={s.sparkle}>✦</Text>
          <Text style={s.title}>{t('profile.welcome.title')}</Text>
          <Text style={s.subtitle}>{t('profile.welcome.subtitle')}</Text>
          <Text style={s.body}>{t('profile.welcome.message')}</Text>
          <TouchableOpacity
            style={[s.claimBtn, claiming && s.claimBtnDisabled]}
            onPress={onClaim}
            disabled={claiming}
            activeOpacity={0.8}
          >
            <Text style={s.claimBtnText}>{t('profile.welcome.claimButton')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDismiss} disabled={claiming} style={s.dismissBtn}>
            <Text style={s.dismissText}>{t('common.done')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(26, 21, 18, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  card: {
    backgroundColor: C.cream,
    borderRadius: 20,
    padding: 32,
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },
  sparkle: {
    fontSize: 36,
    color: C.burg,
    marginBottom: 4,
  },
  title: {
    fontFamily: F.serif,
    fontSize: 28,
    color: C.ink,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.burg,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  body: {
    fontFamily: F.sans,
    fontSize: 14,
    color: C.ink,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 6,
    marginBottom: 4,
  },
  claimBtn: {
    backgroundColor: C.burg,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
  },
  claimBtnDisabled: {
    opacity: 0.6,
  },
  claimBtnText: {
    fontFamily: F.sansMed,
    fontSize: 12,
    color: '#fff',
    letterSpacing: 1.2,
  },
  dismissBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  dismissText: {
    fontFamily: F.sans,
    fontSize: 13,
    color: C.midGray,
  },
})
