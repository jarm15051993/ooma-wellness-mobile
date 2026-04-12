import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { C, F } from '@/constants/theme'
import CancelBookingModal from '@/components/CancelBookingModal'
import Toast from '@/components/Toast'
import BetaOverlay from '@/components/BetaOverlay'
import { useAuth } from '@/contexts/AuthContext'

type ClassInfo = {
  id: string
  title: string
  startTime: string
  endTime: string
  instructor: string | null
}

type Booking = {
  id: string
  classId: string
  stretcherNumber: number
  status: string
  class: ClassInfo
}

type PastClass = {
  bookingId: string
  class: {
    title: string
    startsAt: string
    instructor: string | null
    durationMins: number
  }
  stretcherNumber: number
  attendedAt: string | null
}

type Tab = 'upcoming' | 'past'

export default function BookingsScreen() {
  const { t } = useTranslation()
  const { isBeta } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('upcoming')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [pastClasses, setPastClasses] = useState<PastClass[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [toast, setToast] = useState({ visible: false, message: '' })

  async function fetchAll() {
    try {
      const [bookingsRes, historyRes] = await Promise.all([
        api.get('/api/mobile/bookings'),
        api.get('/api/mobile/bookings/history'),
      ])
      setBookings(bookingsRes.data.bookings)
      setPastClasses(historyRes.data.history)
    } catch (err: any) {
      if (err.response?.status !== 401) {
        Alert.alert('Error', err.response?.data?.error ?? 'Failed to load classes')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      fetchAll()
    }, [])
  )

  async function handleCancelConfirm() {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      const { data } = await api.patch(`/api/bookings/${cancelTarget.id}/cancel`)
      await fetchAll()
      setCancelTarget(null)
      setToast({
        visible: true,
        message: data.creditLost
          ? t('classes.creditLostWarning')
          : t('classes.cancellationSuccess'),
      })
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error ?? 'Something went wrong')
    } finally {
      setCancelling(false)
    }
  }

  function renderUpcoming({ item }: { item: Booking }) {
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.classTitle}>{item.class.title}</Text>
          <View style={styles.reformerBadge}>
            <Text style={styles.reformerBadgeText}>{t('bookings.reformer', { number: item.stretcherNumber })}</Text>
          </View>
        </View>
        <Text style={styles.dateText}>
          {format(new Date(item.class.startTime), 'EEEE, MMMM d')}
        </Text>
        <Text style={styles.timeText}>
          {format(new Date(item.class.startTime), 'h:mm a')} –{' '}
          {format(new Date(item.class.endTime), 'h:mm a')}
        </Text>
        {item.class.instructor ? (
          <Text style={styles.instructorText}>{item.class.instructor}</Text>
        ) : null}
        <View style={styles.divider} />
        <TouchableOpacity style={styles.cancelBtn} onPress={() => setCancelTarget(item)}>
          <Text style={styles.cancelBtnText}>{t('classes.cancelClass').toUpperCase()}</Text>
        </TouchableOpacity>
      </View>
    )
  }

  function renderPast({ item }: { item: PastClass }) {
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.classTitle}>{item.class.title}</Text>
          <View style={styles.attendedBadge}>
            <Text style={styles.attendedBadgeText}>{t('bookings.attended').toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.dateText}>
          {format(new Date(item.class.startsAt), 'EEEE, MMMM d')}
        </Text>
        <Text style={styles.timeText}>
          {format(new Date(item.class.startsAt), 'h:mm a')} · {item.class.durationMins} min
        </Text>
        {item.class.instructor ? (
          <Text style={styles.instructorText}>{item.class.instructor}</Text>
        ) : null}
        <Text style={styles.reformerText}>{t('bookings.reformer', { number: item.stretcherNumber })}</Text>
      </View>
    )
  }

  const header = (
    <>
      <View style={styles.headingRow}>
        <Text style={styles.headingItalic}>{t('bookings.title')}</Text>
      </View>
      <View style={styles.toggle}>
        <TouchableOpacity
          style={[styles.toggleBtn, activeTab === 'upcoming' && styles.toggleBtnActive]}
          onPress={() => setActiveTab('upcoming')}
        >
          <Text style={[styles.toggleBtnText, activeTab === 'upcoming' && styles.toggleBtnTextActive]}>
            {t('bookings.upcoming')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, activeTab === 'past' && styles.toggleBtnActive]}
          onPress={() => setActiveTab('past')}
        >
          <Text style={[styles.toggleBtnText, activeTab === 'past' && styles.toggleBtnTextActive]}>
            {t('bookings.history')}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  )

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={C.burg} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      {activeTab === 'upcoming' ? (
        <FlatList
          data={bookings}
          keyExtractor={item => item.id}
          renderItem={renderUpcoming}
          contentContainerStyle={[
            styles.listContent,
            bookings.length === 0 && styles.emptyContainer,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchAll() }}
              tintColor={C.burg}
            />
          }
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{t('bookings.noUpcoming')}</Text>
              <Text style={styles.emptySubtext}>{t('bookings.noUpcomingMessage')}</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={pastClasses}
          keyExtractor={item => item.bookingId}
          renderItem={renderPast}
          contentContainerStyle={[
            styles.listContent,
            pastClasses.length === 0 && styles.emptyContainer,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchAll() }}
              tintColor={C.burg}
            />
          }
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{t('bookings.noHistory')}</Text>
              <Text style={styles.emptySubtext}>{t('bookings.noUpcomingMessage')}</Text>
            </View>
          }
        />
      )}

      {cancelTarget && (
        <CancelBookingModal
          visible={!!cancelTarget}
          classStartsAt={cancelTarget.class.startTime}
          loading={cancelling}
          onKeep={() => setCancelTarget(null)}
          onConfirm={handleCancelConfirm}
        />
      )}

      <Toast
        message={toast.message}
        visible={toast.visible}
        onHide={() => setToast(t => ({ ...t, visible: false }))}
      />

      {isBeta && <BetaOverlay />}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.cream },
  centered: { flex: 1, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 },
  emptyContainer: { flexGrow: 1 },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 20,
    marginTop: 8,
  },
  headingRegular: { fontFamily: F.serifReg, fontSize: 32, color: C.ink },
  headingItalic: { fontFamily: F.serif, fontSize: 32, color: C.burg },
  toggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 2,
    marginBottom: 20,
    overflow: 'hidden',
  },
  toggleBtn: {
    flex: 1,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.warmWhite,
  },
  toggleBtnActive: { backgroundColor: C.ink },
  toggleBtnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.midGray,
    letterSpacing: 1.5,
  },
  toggleBtnTextActive: { color: C.cream },
  card: {
    backgroundColor: C.warmWhite,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    padding: 18,
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  classTitle: { fontFamily: F.serifBold, fontSize: 18, color: C.ink, flex: 1 },
  reformerBadge: {
    backgroundColor: C.burgPale,
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  reformerBadgeText: { fontFamily: F.sansMed, fontSize: 10, color: C.burg, letterSpacing: 0.5 },
  attendedBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  attendedBadgeText: { fontFamily: F.sansMed, fontSize: 10, color: '#15803D', letterSpacing: 0.5 },
  dateText: { fontFamily: F.sansReg, fontSize: 13, color: C.midGray, marginBottom: 2 },
  timeText: { fontFamily: F.sansReg, fontSize: 13, color: C.midGray, marginBottom: 2 },
  instructorText: { fontFamily: F.sansReg, fontSize: 12, color: C.lightGray },
  reformerText: { fontFamily: F.sansMed, fontSize: 12, color: C.burg, marginTop: 6 },
  divider: { height: 1, backgroundColor: C.rule, marginVertical: 14 },
  cancelBtn: {
    height: 40,
    borderWidth: 1,
    borderColor: C.burg,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: { fontFamily: F.sansMed, fontSize: 11, color: C.burg, letterSpacing: 2 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontFamily: F.serifReg, fontSize: 20, color: C.ink, marginBottom: 8, textAlign: 'center' },
  emptySubtext: { fontFamily: F.sansReg, fontSize: 13, color: C.midGray, textAlign: 'center' },
})
