import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
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
import BuyClassesModal from '@/components/BuyClassesModal'
import Toast from '@/components/Toast'

type ClassItem = {
  id: string
  title: string
  startTime: string
  endTime: string
  capacity: number
  bookedSpots: number
  availableSpots: number
  isFull: boolean
  isBooked: boolean
  userStretcherNumber: number | null
  instructor: string | null
  bookingId: string | null
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function groupByDate(classes: ClassItem[]): Record<string, ClassItem[]> {
  const map: Record<string, ClassItem[]> = {}
  for (const c of classes) {
    const key = toDateKey(new Date(c.startTime))
    if (!map[key]) map[key] = []
    map[key].push(c)
  }
  return map
}

function availabilityBadge(item: ClassItem): { label: string; bg: string; text: string } {
  if (item.isBooked) return { label: `Reformer #${item.userStretcherNumber}`, bg: C.burgPale, text: C.burg }
  if (item.isFull) return { label: 'Class Full', bg: '#FEE2E2', text: C.red }
  if (item.availableSpots <= 3) return { label: `${item.availableSpots} left`, bg: '#FEF9C3', text: '#92400E' }
  return { label: `${item.availableSpots} spots`, bg: '#DCFCE7', text: '#15803D' }
}

export default function ClassesScreen() {
  const today = new Date()
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actingClassId, setActingClassId] = useState<string | null>(null)
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedKey, setSelectedKey] = useState(toDateKey(today))
  const [cancelTarget, setCancelTarget] = useState<ClassItem | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [toast, setToast] = useState({ visible: false, message: '' })
  const [userCredits, setUserCredits] = useState(0)
  const [buyTarget, setBuyTarget] = useState<string | null>(null) // classId that triggered "Buy More Classes"

  async function fetchClasses() {
    try {
      const [classesRes, creditsRes] = await Promise.all([
        api.get('/api/mobile/classes'),
        api.get('/api/mobile/credits'),
      ])
      setClasses(classesRes.data.classes)
      setUserCredits(creditsRes.data.totalCredits ?? 0)
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
      fetchClasses()
    }, [])
  )

  async function handleBook(classId: string) {
    setActingClassId(classId)
    try {
      await api.post('/api/bookings', { classId })
      await fetchClasses()
      setToast({ visible: true, message: 'Class booked!' })
    } catch (err: any) {
      Alert.alert('Booking failed', err.response?.data?.error ?? 'Something went wrong')
    } finally {
      setActingClassId(null)
    }
  }

  async function handleCancelConfirm() {
    if (!cancelTarget?.bookingId) return
    setCancelling(true)
    try {
      const { data } = await api.patch(`/api/bookings/${cancelTarget.bookingId}/cancel`)
      await fetchClasses()
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

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  // Build calendar grid
  const grouped = groupByDate(classes)
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const todayKey = toDateKey(today)

  // Pad days
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  // Fill to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  const selectedClasses = grouped[selectedKey] ?? []

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
            onRefresh={() => { setRefreshing(true); fetchClasses() }}
            tintColor={C.burg}
          />
        }
      >
        {/* Heading */}
        <View style={styles.headingRow}>
          <Text style={styles.headingRegular}>My </Text>
          <Text style={styles.headingItalic}>Calendar</Text>
        </View>

        {/* Calendar card */}
        <View style={styles.calendarCard}>
          {/* Month navigation */}
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
              <Text style={styles.navArrow}>{'‹'}</Text>
            </TouchableOpacity>
            <Text style={styles.monthLabel}>
              {MONTHS[viewMonth]} {viewYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
              <Text style={styles.navArrow}>{'›'}</Text>
            </TouchableOpacity>
          </View>

          {/* Weekday headers */}
          <View style={styles.weekRow}>
            {WEEKDAYS.map(d => (
              <View key={d} style={styles.weekCell}>
                <Text style={styles.weekLabel}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Day grid */}
          <View style={styles.grid}>
            {cells.map((day, idx) => {
              if (day === null) {
                return <View key={`empty-${idx}`} style={styles.dayCell} />
              }
              const key = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const isToday = key === todayKey
              const isSelected = key === selectedKey
              const hasClasses = !!grouped[key]

              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.dayCell,
                    isToday && !isSelected && styles.dayCellToday,
                    isSelected && styles.dayCellSelected,
                  ]}
                  onPress={() => setSelectedKey(key)}
                >
                  <Text
                    style={[
                      styles.dayNum,
                      isToday && !isSelected && styles.dayNumToday,
                      isSelected && styles.dayNumSelected,
                    ]}
                  >
                    {day}
                  </Text>
                  {hasClasses && (
                    <View
                      style={[
                        styles.dot,
                        isSelected && styles.dotSelected,
                      ]}
                    />
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Selected day classes */}
        <View style={styles.classesSection}>
          {selectedClasses.length === 0 ? (
            <View style={styles.emptyDay}>
              <Text style={styles.emptyDayText}>No classes on this day.</Text>
            </View>
          ) : (
            selectedClasses.map(item => {
              const isActing = actingClassId === item.id
              const badge = availabilityBadge(item)
              return (
                <View key={item.id} style={styles.classCard}>
                  <View style={styles.classCardTop}>
                    <Text style={styles.classTitle}>{item.title}</Text>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.text }]}>
                        {badge.label}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.classMeta}>
                    {formatTime(item.startTime)} – {formatTime(item.endTime)}
                  </Text>
                  {item.instructor ? (
                    <Text style={styles.classMeta}>{item.instructor}</Text>
                  ) : null}

                  <View style={styles.cardActions}>
                    {item.isBooked ? (
                      // Case 2: already booked → Cancel Class
                      <TouchableOpacity
                        style={[styles.cancelBtn, isActing && styles.btnDisabled]}
                        onPress={() => setCancelTarget(item)}
                        disabled={isActing}
                      >
                        <Text style={styles.cancelBtnText}>CANCEL CLASS</Text>
                      </TouchableOpacity>
                    ) : item.isFull ? (
                      // Class is full — disabled
                      <TouchableOpacity style={[styles.bookBtn, styles.btnDisabled]} disabled>
                        <Text style={styles.bookBtnText}>CLASS FULL</Text>
                      </TouchableOpacity>
                    ) : userCredits > 0 ? (
                      // Case 1: has balance → Book
                      <TouchableOpacity
                        style={[styles.bookBtn, isActing && styles.btnDisabled]}
                        onPress={() => handleBook(item.id)}
                        disabled={isActing}
                      >
                        {isActing
                          ? <ActivityIndicator size="small" color={C.cream} />
                          : <Text style={styles.bookBtnText}>BOOK</Text>
                        }
                      </TouchableOpacity>
                    ) : (
                      // Case 3: no balance → Buy More Classes
                      <TouchableOpacity
                        style={styles.buyMoreBtn}
                        onPress={() => setBuyTarget(item.id)}
                      >
                        <Text style={styles.buyMoreBtnText}>BUY MORE CLASSES</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )
            })
          )}
        </View>
      </ScrollView>

      {cancelTarget && (
        <CancelBookingModal
          visible={!!cancelTarget}
          classStartsAt={cancelTarget.startTime}
          loading={cancelling}
          onKeep={() => setCancelTarget(null)}
          onConfirm={handleCancelConfirm}
        />
      )}

      <BuyClassesModal
        visible={buyTarget !== null}
        pendingClassId={buyTarget}
        onClose={() => setBuyTarget(null)}
        onPurchaseAndBooked={() => {
          setBuyTarget(null)
          fetchClasses()
          setToast({ visible: true, message: 'Payment successful — class booked!' })
        }}
        onPurchaseOnly={() => {
          setBuyTarget(null)
          fetchClasses()
          setToast({ visible: true, message: 'Payment successful — credits added!' })
        }}
      />

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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 8,
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
  calendarCard: {
    backgroundColor: C.warmWhite,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    padding: 16,
    marginBottom: 20,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrow: {
    fontSize: 24,
    color: C.ink,
    lineHeight: 28,
  },
  monthLabel: {
    fontFamily: F.sansMed,
    fontSize: 13,
    color: C.ink,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  weekLabel: {
    fontFamily: F.sansMed,
    fontSize: 9,
    color: C.midGray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  dayCellToday: {
    backgroundColor: C.burgPale,
    borderWidth: 1,
    borderColor: C.burg,
  },
  dayCellSelected: {
    backgroundColor: C.burg,
  },
  dayNum: {
    fontFamily: F.sansReg,
    fontSize: 13,
    color: C.ink,
    lineHeight: 18,
  },
  dayNumToday: {
    color: C.burg,
    fontFamily: F.sansMed,
  },
  dayNumSelected: {
    color: '#FFFFFF',
    fontFamily: F.sansMed,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.burg,
    marginTop: 2,
  },
  dotSelected: {
    backgroundColor: C.burgPale,
  },
  classesSection: {
    gap: 12,
  },
  emptyDay: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyDayText: {
    fontFamily: F.sansReg,
    fontSize: 13,
    color: C.midGray,
  },
  classCard: {
    backgroundColor: C.warmWhite,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    padding: 16,
  },
  classCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  classTitle: {
    fontFamily: F.serifBold,
    fontSize: 18,
    color: C.ink,
    flex: 1,
  },
  badge: {
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  badgeText: {
    fontFamily: F.sansMed,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  classMeta: {
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.midGray,
    marginBottom: 2,
  },
  cardActions: {
    marginTop: 12,
  },
  bookBtn: {
    height: 42,
    backgroundColor: C.ink,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookBtnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.cream,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  cancelBtn: {
    height: 42,
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
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  buyMoreBtn: {
    height: 42,
    backgroundColor: C.burg,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyMoreBtnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.cream,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  btnDisabled: {
    opacity: 0.5,
  },
})
