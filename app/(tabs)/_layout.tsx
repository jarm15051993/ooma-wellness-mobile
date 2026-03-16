import { Tabs } from 'expo-router'
import { Text } from 'react-native'
import { C, F } from '@/constants/theme'

function TabIcon({ label, color }: { label: string; color: string }) {
  const icons: Record<string, string> = {
    Classes: '◈',
    Bookings: '◉',
    Profile: '◎',
  }
  return (
    <Text style={{ fontSize: 18, color, lineHeight: 22 }}>
      {icons[label] ?? '•'}
    </Text>
  )
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.burg,
        tabBarInactiveTintColor: C.lightGray,
        tabBarStyle: {
          backgroundColor: C.cream,
          borderTopColor: C.rule,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontFamily: F.sansMed,
          fontSize: 10,
          letterSpacing: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Classes',
          tabBarIcon: ({ color }) => <TabIcon label="Classes" color={color} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'My Bookings',
          tabBarIcon: ({ color }) => <TabIcon label="Bookings" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabIcon label="Profile" color={color} />,
        }}
      />
    </Tabs>
  )
}
