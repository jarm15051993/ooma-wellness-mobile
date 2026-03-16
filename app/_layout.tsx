import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { StripeProvider } from '@stripe/stripe-react-native'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { useFonts } from 'expo-font'
import {
  CormorantGaramond_300Light_Italic,
  CormorantGaramond_400Regular,
  CormorantGaramond_600SemiBold,
} from '@expo-google-fonts/cormorant-garamond'
import {
  Montserrat_300Light,
  Montserrat_400Regular,
  Montserrat_500Medium,
} from '@expo-google-fonts/montserrat'
import { C } from '@/constants/theme'

function RootLayoutNav() {
  const { user, isLoading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return
    const inAuthGroup = segments[0] === '(auth)'
    const onCompleteProfile = segments[1] === 'complete-profile'

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (user && user.onboardingCompleted && inAuthGroup) {
      router.replace('/(tabs)')
    } else if (user && !user.onboardingCompleted && !onCompleteProfile) {
      router.replace(`/(auth)/complete-profile?userId=${user.id}&email=${encodeURIComponent(user.email)}`)
    }
  }, [user, isLoading, segments])

  // Block all screen rendering until auth state is restored —
  // prevents tabs from firing authenticated API calls and showing "Unauthorized"
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.burg} />
      </View>
    )
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="packages" options={{ presentation: 'modal' }} />
    </Stack>
  )
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    CormorantGaramond_300Light_Italic,
    CormorantGaramond_400Regular,
    CormorantGaramond_600SemiBold,
    Montserrat_300Light,
    Montserrat_400Regular,
    Montserrat_500Medium,
  })

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.burg} />
      </View>
    )
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!}>
        <AuthProvider>
          <RootLayoutNav />
        </AuthProvider>
      </StripeProvider>
    </GestureHandlerRootView>
  )
}
