import { useEffect, useRef } from 'react'
import { View, Text, Image, Animated, StyleSheet } from 'react-native'
import { C, F } from '@/constants/theme'

export default function BetaOverlay() {
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start()
  }, [])

  return (
    <Animated.View style={[s.overlay, { opacity }]} pointerEvents="box-only">
      <Image source={require('@/assets/splash-icon.png')} style={s.logo} resizeMode="contain" />
      <Text style={s.heading}>Coming Soon</Text>
      <Text style={s.subtext}>
        We're putting the finishing touches on something special. Stay tuned.
      </Text>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(20, 10, 5, 0.82)',
    zIndex: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 32,
  },
  heading: {
    fontFamily: F.serif,
    fontSize: 42,
    color: C.cream,
    marginBottom: 16,
    textAlign: 'center',
  },
  subtext: {
    fontFamily: F.sans,
    fontSize: 14,
    color: 'rgba(247, 243, 238, 0.65)',
    textAlign: 'center',
    lineHeight: 22,
  },
})
