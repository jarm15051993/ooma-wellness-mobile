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
import { api } from '@/lib/api'
import { C, F } from '@/constants/theme'
import CancelBookingModal from '@/components/CancelBookingModal'
import Toast from '@/components/Toast'

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

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export default function BookingsScreen() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [toast, setToast] = useState({ visible: false, message: '' })

  async function fetchBookings() {
    try {
      const { data } = await api.get('/api/mobile/bookings')
      setBookings(data.bookings)
    } catch (err: any) {
      if (err.response?.status !== 401) {
        Alert.alert('Error', err.response?.data?.error ?? 'Failed to load bookings')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      fetchBookings()
    }, [])
  )

  async function handleCancelConfirm() {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      const { data } = await api.patch(`/api/bookings/${cancelTarget.id}/cancel`)
      await fetchBookings()
      setCancelTarget(null)
      setToast({
        visible: true,
        message: data.creditLost
          ? 'Booking cancelled — credit not returned'
          : 'Booking cancelled',
      })
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error ?? 'Something went wrong')
    } finally {
      setCancelling(false)
    }
  }

  function renderBooking({ item }: { item: Booking }) {
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.classTitle}>{item.class.title}</Text>
          <View style={styles.reformerBadge}>
            <Text style={styles.reformerBadgeText}>Reformer #{item.stretcherNumber}</Text>
          </View>
        </View>

        <Text style={styles.dateText}>{formatDate(item.class.startTime)}</Text>
        <Text style={styles.timeText}>
          {formatTime(item.class.startTime)} – {formatTime(item.class.endTime)}
        </Text>
        {item.class.instructor ? (
          <Text style={styles.instructorText}>{item.class.instructor}</Text>
        ) : null}

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => setCancelTarget(item)}
        >
          <Text style={styles.cancelBtnText}>CANCEL BOOKING</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={C.burg} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={bookings}
        keyExtractor={item => item.id}
        renderItem={renderBooking}
        contentContainerStyle={[
          styles.listContent,
          bookings.length === 0 && styles.emptyContainer,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchBookings() }}
            tintColor={C.burg}
          />
        }
        ListHeaderComponent={
          <View style={styles.headingRow}>
            <Text style={styles.headingRegular}>My </Text>
            <Text style={styles.headingItalic}>Bookings</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No upcoming bookings.</Text>
            <Text style={styles.emptySubtext}>Browse classes to book your next session.</Text>
          </View>
        }
      />

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
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.cream,
  },
  centered: {
    flex: 1,
    backgroundColor: C.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 8,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 20,
    marginTop: 8,
  },
  headingRegular: {
    fontFamily: F.serifReg,
    fontSize: 32,
    color: C.ink,
  },
  headingItalic: {
    fontFamily: F.serif,
    fontSize: 32,
    color: C.burg,
  },
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
  classTitle: {
    fontFamily: F.serifBold,
    fontSize: 18,
    color: C.ink,
    flex: 1,
  },
  reformerBadge: {
    backgroundColor: C.burgPale,
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  reformerBadgeText: {
    fontFamily: F.sansMed,
    fontSize: 10,
    color: C.burg,
    letterSpacing: 0.5,
  },
  dateText: {
    fontFamily: F.sansReg,
    fontSize: 13,
    color: C.midGray,
    marginBottom: 2,
  },
  timeText: {
    fontFamily: F.sansReg,
    fontSize: 13,
    color: C.midGray,
    marginBottom: 2,
  },
  instructorText: {
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.lightGray,
  },
  divider: {
    height: 1,
    backgroundColor: C.rule,
    marginVertical: 14,
  },
  cancelBtn: {
    height: 40,
    borderWidth: 1,
    borderColor: C.burg,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.burg,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontFamily: F.serifReg,
    fontSize: 20,
    color: C.ink,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontFamily: F.sansReg,
    fontSize: 13,
    color: C.midGray,
    textAlign: 'center',
  },
})
