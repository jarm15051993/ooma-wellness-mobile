import { Tabs } from 'expo-router'
import { Text } from 'react-native'
import { C, F } from '@/constants/theme'
import { useAuth } from '@/contexts/AuthContext'

function TabIcon({ label, color }: { label: string; color: string }) {
  const icons: Record<string, string> = {
    Classes: '◈',
    Bookings: '◉',
    Profile: '◎',
    Admin: '⊕',
  }
  return (
    <Text style={{ fontSize: 18, color, lineHeight: 22 }}>
      {icons[label] ?? '•'}
    </Text>
  )
}

export default function TabLayout() {
  const { isAdmin } = useAuth()

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
          title: 'My Classes',
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
      <Tabs.Screen
        name="admin/index"
        options={{
          title: 'Admin',
          tabBarIcon: ({ color }) => <TabIcon label="Admin" color={color} />,
          tabBarItemStyle: isAdmin ? undefined : { display: 'none' },
          tabBarButton: isAdmin ? undefined : () => null,
        }}
      />
    </Tabs>
  )
}
