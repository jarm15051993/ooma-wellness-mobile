import { useEffect, useRef } from 'react'
import { Animated, Text, StyleSheet } from 'react-native'
import { C, F } from '@/constants/theme'

type Props = {
  message: string
  visible: boolean
  onHide: () => void
}

export default function Toast({ message, visible, onHide }: Props) {
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!visible) return

    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => onHide())
  }, [visible])

  if (!visible) return null

  return (
    <Animated.View style={[styles.toast, { opacity }]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    backgroundColor: C.ink,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 4,
    maxWidth: '85%',
    zIndex: 999,
  },
  text: {
    fontFamily: F.sansReg,
    fontSize: 13,
    color: C.cream,
    textAlign: 'center',
    lineHeight: 18,
  },
})
