import { Tabs } from 'expo-router'
import { Text } from 'react-native'
import { C, F } from '@/constants/theme'
import { useAuth } from '@/contexts/AuthContext'

function TabIcon({ label, color }: { label: string; color: string }) {
  const icons: Record<string, string> = {
    Classes: '◈',
    Bookings: '◉',
    Profile: '◎',
    Students: '⊕',
  }
  return (
    <Text style={{ fontSize: 18, color, lineHeight: 22 }}>
      {icons[label] ?? '•'}
    </Text>
  )
}

export default function TabLayout() {
  const { isAdmin, isOwner, canViewStudents } = useAuth()

  const isStaff = isAdmin || isOwner
  const showStudents = canViewStudents || isOwner

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
          tabBarItemStyle: isStaff ? { display: 'none' } : undefined,
          tabBarButton: isStaff ? () => null : undefined,
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
        name="students/index"
        options={{
          title: 'Students',
          tabBarIcon: ({ color }) => <TabIcon label="Students" color={color} />,
          tabBarItemStyle: showStudents ? undefined : { display: 'none' },
          tabBarButton: showStudents ? undefined : () => null,
        }}
      />
      {/* Legacy admin tab — hidden for all, kept to avoid routing errors */}
      <Tabs.Screen
        name="admin/index"
        options={{
          tabBarItemStyle: { display: 'none' },
          tabBarButton: () => null,
        }}
      />
    </Tabs>
  )
}
