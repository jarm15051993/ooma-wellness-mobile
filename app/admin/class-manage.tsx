import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { format } from 'date-fns'
import { api } from '@/lib/api'
import { C, F } from '@/constants/theme'

type Attendee = {
  bookingId: string
  status: 'confirmed' | 'attended'
  stretcherNumber: number
  user: {
    id: string
    fullName: string
    goals: string | null
    healthConditions: string | null
  }
}

type ClassInfo = {
  id: string
  title: string
  startTime: string
  endTime: string
  instructor: string | null
}

export default function ClassManageScreen() {
  const { classId } = useLocalSearchParams<{ classId: string }>()
  const router = useRouter()

  const [cls, setCls] = useState<ClassInfo | null>(null)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<Attendee | null>(null)

  async function fetchAttendees() {
    try {
      const { data } = await api.get(`/api/admin/classes/${classId}/attendees`)
      setCls(data.class)
      setAttendees(data.attendees)
    } catch (err: any) {
      console.error('Fetch attendees error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      fetchAttendees()
    }, [classId])
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchAttendees() }}
            tintColor={C.burg}
          />
        }
      >
        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>{'‹'} Back</Text>
        </TouchableOpacity>

        {/* Class header */}
        {cls && (
          <View style={styles.classHeader}>
            <Text style={styles.classTitle}>{cls.title}</Text>
            <Text style={styles.classMeta}>
              {format(new Date(cls.startTime), 'EEE, MMM d · h:mm a')} –{' '}
              {format(new Date(cls.endTime), 'h:mm a')}
            </Text>
            {cls.instructor ? (
              <Text style={styles.classMeta}>{cls.instructor}</Text>
            ) : null}
            <Text style={styles.attendeeCount}>
              {attendees.length} {attendees.length === 1 ? 'participant' : 'participants'}
            </Text>
          </View>
        )}

        {/* Attendee list */}
        {attendees.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No bookings for this class yet.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {attendees.map((a) => (
              <TouchableOpacity
                key={a.bookingId}
                style={styles.row}
                onPress={() => setSelected(a)}
                activeOpacity={0.7}
              >
                <View style={styles.rowLeft}>
                  <Text style={styles.rowName}>{a.user.fullName}</Text>
                  <Text style={styles.rowSub}>Reformer {a.stretcherNumber}</Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  a.status === 'attended' ? styles.statusAttended : styles.statusConfirmed,
                ]}>
                  <Text style={[
                    styles.statusText,
                    a.status === 'attended' ? styles.statusTextAttended : styles.statusTextConfirmed,
                  ]}>
                    {a.status === 'attended' ? 'ATTENDED' : 'CONFIRMED'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Spacer for fixed button */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Scan QR button */}
      <View style={styles.fixedBottom}>
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() =>
            router.push({
              pathname: '/admin/qr-scanner',
              params: {
                classId,
                attendees: JSON.stringify(attendees),
              },
            })
          }
        >
          <Text style={styles.scanBtnText}>SCAN QR TO VALIDATE</Text>
        </TouchableOpacity>
      </View>

      {/* Attendee detail bottom sheet */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelected(null)}
        />
        {selected && (
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetName}>{selected.user.fullName}</Text>
              <View style={[
                styles.statusBadge,
                selected.status === 'attended' ? styles.statusAttended : styles.statusConfirmed,
              ]}>
                <Text style={[
                  styles.statusText,
                  selected.status === 'attended' ? styles.statusTextAttended : styles.statusTextConfirmed,
                ]}>
                  {selected.status === 'attended' ? 'ATTENDED' : 'CONFIRMED'}
                </Text>
              </View>
            </View>

            <Text style={styles.sheetSubLabel}>Reformer</Text>
            <Text style={styles.sheetSubValue}>{selected.stretcherNumber}</Text>

            <Text style={styles.sheetSubLabel}>Goals</Text>
            <Text style={styles.sheetSubValue}>
              {selected.user.goals ?? 'Not provided'}
            </Text>

            <Text style={styles.sheetSubLabel}>Health Conditions</Text>
            <Text style={styles.sheetSubValue}>
              {selected.user.healthConditions ?? 'None noted'}
            </Text>

            <TouchableOpacity style={styles.sheetClose} onPress={() => setSelected(null)}>
              <Text style={styles.sheetCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.cream },
  centered: { flex: 1, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 },
  backBtn: { paddingVertical: 8, marginBottom: 4 },
  backText: { fontFamily: F.sansReg, fontSize: 14, color: C.burg },
  classHeader: {
    backgroundColor: C.warmWhite,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    padding: 16,
    marginBottom: 20,
  },
  classTitle: { fontFamily: F.serifBold, fontSize: 22, color: C.ink, marginBottom: 6 },
  classMeta: { fontFamily: F.sansReg, fontSize: 12, color: C.midGray, marginBottom: 2 },
  attendeeCount: { fontFamily: F.sansMed, fontSize: 12, color: C.burg, marginTop: 8 },
  emptyState: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontFamily: F.sansReg, fontSize: 13, color: C.midGray },
  list: { gap: 8 },
  row: {
    backgroundColor: C.warmWhite,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: { flex: 1 },
  rowName: { fontFamily: F.sansMed, fontSize: 14, color: C.ink },
  rowSub: { fontFamily: F.sansReg, fontSize: 12, color: C.midGray, marginTop: 2 },
  statusBadge: {
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusConfirmed: { backgroundColor: '#F3F4F6' },
  statusAttended: { backgroundColor: '#DCFCE7' },
  statusText: { fontFamily: F.sansMed, fontSize: 10, letterSpacing: 0.5 },
  statusTextConfirmed: { color: C.midGray },
  statusTextAttended: { color: '#15803D' },
  fixedBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.cream,
    borderTopWidth: 1,
    borderTopColor: C.rule,
    padding: 16,
    paddingBottom: 32,
  },
  scanBtn: {
    height: 48,
    backgroundColor: C.ink,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanBtnText: { fontFamily: F.sansMed, fontSize: 12, color: C.cream, letterSpacing: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: C.warmWhite,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.rule,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  sheetName: { fontFamily: F.serifBold, fontSize: 20, color: C.ink, flex: 1, marginRight: 12 },
  sheetSubLabel: { fontFamily: F.sansMed, fontSize: 10, color: C.midGray, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  sheetSubValue: { fontFamily: F.sansReg, fontSize: 14, color: C.ink, marginBottom: 16 },
  sheetClose: {
    height: 44,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  sheetCloseText: { fontFamily: F.sansMed, fontSize: 12, color: C.ink, letterSpacing: 1 },
})
