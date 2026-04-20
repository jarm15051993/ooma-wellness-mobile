import { Tabs } from 'expo-router'
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { C, F } from '@/constants/theme'
import { useAuth } from '@/contexts/AuthContext'

function TabIcon({ label, color }: { label: string; color: string }) {
  const icons: Record<string, string> = {
    Classes: '◈',
    Bookings: '◉',
    Subscriptions: '◫',
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
  const { t } = useTranslation()
  const { isAdmin, isOwner, canViewStudents, tenantUser } = useAuth()

  const isStaff = isAdmin || isOwner
  const showStudents = (canViewStudents || isOwner) && !tenantUser
  const showBookings = !isStaff || !!tenantUser
  const showPackages = !isStaff || !!tenantUser

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
          title: t('classes.tabTitle'),
          tabBarIcon: ({ color }) => <TabIcon label="Classes" color={color} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: t('bookings.tabTitle'),
          tabBarIcon: ({ color }) => <TabIcon label="Bookings" color={color} />,
          tabBarItemStyle: showBookings ? undefined : { display: 'none' },
          tabBarButton: showBookings ? undefined : () => null,
        }}
      />
      <Tabs.Screen
        name="packages"
        options={{
          title: t('packages.tabTitle'),
          tabBarIcon: ({ color }) => <TabIcon label="Subscriptions" color={color} />,
          tabBarItemStyle: showPackages ? undefined : { display: 'none' },
          tabBarButton: showPackages ? undefined : () => null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profile.tabTitle'),
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
