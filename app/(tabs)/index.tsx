import React, { useState, useCallback } from 'react'
import * as Calendar from 'expo-calendar'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import DateTimePicker from '@react-native-community/datetimepicker'
import { format, addMinutes } from 'date-fns'
import { api } from '@/lib/api'
import { C, F } from '@/constants/theme'
import CancelBookingModal from '@/components/CancelBookingModal'
import BuyClassesModal from '@/components/BuyClassesModal'
import Toast from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'

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

type CreateClassForm = {
  title: string
  instructor: string
  date: Date
  startTime: Date
  durationMins: string
  capacity: string
}

type CreateClassErrors = Partial<Record<keyof CreateClassForm, string>>

function buildDateTimeUTC(date: Date, time: Date): Date {
  const d = new Date(date)
  d.setHours(time.getHours(), time.getMinutes(), 0, 0)
  return d
}

export default function ClassesScreen() {
  const { isAdmin, isOwner, canCreateClass, tenantUser } = useAuth()
  const router = useRouter()
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
  const [buyTarget, setBuyTarget] = useState<string | null>(null)

  // Create Class modal state
  const [bookingSuccessData, setBookingSuccessData] = useState<{
    title: string
    startTime: string
    endTime: string
    instructor: string | null
    stretcherNumber: number | null
  } | null>(null)
  const [addingToCalendar, setAddingToCalendar] = useState(false)

  // Create Class modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState<CreateClassForm>({
    title: '', instructor: '', date: today, startTime: today,
    durationMins: '50', capacity: '6',
  })
  const [createErrors, setCreateErrors] = useState<CreateClassErrors>({})
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [creating, setCreating] = useState(false)

  const showCreateButton = (canCreateClass || isOwner) && !tenantUser

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

  function validateCreateForm(): boolean {
    const errs: CreateClassErrors = {}
    if (!createForm.title.trim()) errs.title = 'Class name is required'
    const dur = parseInt(createForm.durationMins)
    if (isNaN(dur) || dur < 15 || dur > 180) errs.durationMins = 'Duration must be 15–180 minutes'
    const cap = parseInt(createForm.capacity)
    if (isNaN(cap) || cap < 1 || cap > 6) errs.capacity = 'Spots must be between 1 and 6'
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const selectedDate = new Date(createForm.date); selectedDate.setHours(0, 0, 0, 0)
    if (selectedDate < now) errs.date = 'Date must be today or in the future'
    setCreateErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleCreateClass() {
    if (!validateCreateForm()) return
    setCreating(true)
    try {
      const dur = parseInt(createForm.durationMins)
      const startTime = buildDateTimeUTC(createForm.date, createForm.startTime)
      const endTime = addMinutes(startTime, dur)
      await api.post('/api/admin/classes', {
        title: createForm.title.trim(),
        instructor: createForm.instructor.trim() || null,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        capacity: parseInt(createForm.capacity),
      })
      setShowCreateModal(false)
      setCreateForm({ title: '', instructor: '', date: today, startTime: today, durationMins: '50', capacity: '6' })
      setCreateErrors({})
      await fetchClasses()
      setToast({ visible: true, message: 'Class created!' })
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'Failed to create class')
    } finally {
      setCreating(false)
    }
  }

  async function handleBook(classId: string) {
    setActingClassId(classId)
    try {
      const { data } = await api.post('/api/bookings', { classId })
      await fetchClasses()
      setBookingSuccessData({
        title: data.booking.class.title,
        startTime: data.booking.class.startTime,
        endTime: data.booking.class.endTime,
        instructor: data.booking.class.instructor ?? null,
        stretcherNumber: data.booking.stretcherNumber ?? null,
      })
    } catch (err: any) {
      Alert.alert('Booking failed', err.response?.data?.error ?? 'Something went wrong')
    } finally {
      setActingClassId(null)
    }
  }

  async function handleAddToCalendar() {
    if (!bookingSuccessData) return
    setAddingToCalendar(true)
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync()
      if (status !== 'granted') {
        setBookingSuccessData(null)
        setToast({ visible: true, message: 'Calendar access denied. Enable it in Settings.' })
        return
      }
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)
      const writableCal = calendars.find(c => c.allowsModifications) ?? calendars[0]
      if (!writableCal) throw new Error('No calendar found')

      const noteParts = [
        bookingSuccessData.instructor ? `Instructor: ${bookingSuccessData.instructor}` : null,
        bookingSuccessData.stretcherNumber != null ? `Reformer #${bookingSuccessData.stretcherNumber}` : null,
      ].filter(Boolean)

      await Calendar.createEventAsync(writableCal.id, {
        title: bookingSuccessData.title,
        startDate: new Date(bookingSuccessData.startTime),
        endDate: new Date(bookingSuccessData.endTime),
        notes: noteParts.length ? noteParts.join(' · ') : undefined,
        location: 'OOMA Wellness Club',
      })
      setBookingSuccessData(null)
      setToast({ visible: true, message: 'Added to your calendar!' })
    } catch {
      Alert.alert('Error', 'Could not add to calendar. Please try again.')
    } finally {
      setAddingToCalendar(false)
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
          : 'Booking cancelled — remember to remove it from your calendar',
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
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <Text style={styles.headingRegular}>My </Text>
            <Text style={styles.headingItalic}>Calendar</Text>
          </View>
          {showCreateButton && (
            <TouchableOpacity style={styles.newClassBtn} onPress={() => setShowCreateModal(true)}>
              <Text style={styles.newClassBtnText}>+ NEW CLASS</Text>
            </TouchableOpacity>
          )}
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
                    {isAdmin && !tenantUser ? (
                      // Admin view (not tenanting) — Manage Class
                      <TouchableOpacity
                        style={styles.bookBtn}
                        onPress={() => router.push({ pathname: '/admin/class-manage', params: { classId: item.id } })}
                      >
                        <Text style={styles.bookBtnText}>MANAGE CLASS</Text>
                      </TouchableOpacity>
                    ) : item.isBooked ? (
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

      {/* Booking Success Modal */}
      <Modal visible={!!bookingSuccessData} transparent animationType="fade" onRequestClose={() => setBookingSuccessData(null)}>
        <View style={styles.successOverlay}>
          <View style={styles.successSheet}>
            <Text style={styles.successTitle}>Class Booked!</Text>
            <View style={styles.successDivider} />

            {bookingSuccessData && (
              <>
                <Text style={styles.successClassName}>{bookingSuccessData.title}</Text>
                <Text style={styles.successMeta}>
                  {new Date(bookingSuccessData.startTime).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </Text>
                <Text style={styles.successMeta}>
                  {new Date(bookingSuccessData.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  {bookingSuccessData.instructor ? ` · ${bookingSuccessData.instructor}` : ''}
                </Text>
                <View style={{ marginBottom: 28 }}>
                  {bookingSuccessData.stretcherNumber != null && (
                    <Text style={[styles.successReformer, { marginBottom: 0 }]}>Reformer #{bookingSuccessData.stretcherNumber}</Text>
                  )}
                </View>
              </>
            )}

            <TouchableOpacity
              style={[styles.calendarBtn, addingToCalendar && styles.btnDisabled]}
              onPress={handleAddToCalendar}
              disabled={addingToCalendar}
            >
              {addingToCalendar
                ? <ActivityIndicator size="small" color={C.cream} />
                : <Text style={styles.calendarBtnText}>ADD TO CALENDAR</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={styles.noThanksBtn} onPress={() => setBookingSuccessData(null)} disabled={addingToCalendar}>
              <Text style={styles.noThanksBtnText}>No thanks</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Create Class Modal */}
      <Modal visible={showCreateModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => { setShowCreateModal(false); setCreateErrors({}) }}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>New Class</Text>
              <TouchableOpacity onPress={handleCreateClass} disabled={creating}>
                {creating
                  ? <ActivityIndicator size="small" color={C.burg} />
                  : <Text style={styles.modalSave}>Create</Text>
                }
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>CLASS NAME *</Text>
              <TextInput
                style={[styles.fieldInput, createErrors.title && styles.fieldInputError]}
                value={createForm.title}
                onChangeText={v => setCreateForm(f => ({ ...f, title: v }))}
                placeholder="e.g. Reformer Pilates"
                placeholderTextColor={C.lightGray}
              />
              {createErrors.title && <Text style={styles.fieldError}>{createErrors.title}</Text>}

              <Text style={styles.fieldLabel}>INSTRUCTOR</Text>
              <TextInput
                style={styles.fieldInput}
                value={createForm.instructor}
                onChangeText={v => setCreateForm(f => ({ ...f, instructor: v }))}
                placeholder="e.g. Sofia M."
                placeholderTextColor={C.lightGray}
              />

              <Text style={styles.fieldLabel}>DATE *</Text>
              <TouchableOpacity
                style={[styles.fieldInput, styles.fieldInputTouchable, createErrors.date && styles.fieldInputError]}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.fieldInputText}>{format(createForm.date, 'MMMM d, yyyy')}</Text>
              </TouchableOpacity>
              {createErrors.date && <Text style={styles.fieldError}>{createErrors.date}</Text>}
              {showDatePicker && (
                <DateTimePicker
                  value={createForm.date}
                  mode="date"
                  minimumDate={today}
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={(_, d) => {
                    setShowDatePicker(Platform.OS === 'ios')
                    if (d) setCreateForm(f => ({ ...f, date: d }))
                  }}
                />
              )}

              <Text style={styles.fieldLabel}>START TIME *</Text>
              <TouchableOpacity
                style={[styles.fieldInput, styles.fieldInputTouchable]}
                onPress={() => setShowTimePicker(true)}
              >
                <Text style={styles.fieldInputText}>{format(createForm.startTime, 'h:mm a')}</Text>
              </TouchableOpacity>
              {showTimePicker && (
                <DateTimePicker
                  value={createForm.startTime}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, t) => {
                    setShowTimePicker(Platform.OS === 'ios')
                    if (t) setCreateForm(f => ({ ...f, startTime: t }))
                  }}
                />
              )}

              <Text style={styles.fieldLabel}>DURATION (MINUTES) *</Text>
              <TextInput
                style={[styles.fieldInput, createErrors.durationMins && styles.fieldInputError]}
                value={createForm.durationMins}
                onChangeText={v => setCreateForm(f => ({ ...f, durationMins: v }))}
                keyboardType="number-pad"
                placeholder="50"
                placeholderTextColor={C.lightGray}
              />
              {createErrors.durationMins && <Text style={styles.fieldError}>{createErrors.durationMins}</Text>}

              <Text style={styles.fieldLabel}>AVAILABLE SPOTS (1–6) *</Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setCreateForm(f => ({ ...f, capacity: String(Math.max(1, parseInt(f.capacity || '1') - 1)) }))}
                >
                  <Text style={styles.stepperBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{createForm.capacity}</Text>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setCreateForm(f => ({ ...f, capacity: String(Math.min(6, parseInt(f.capacity || '6') + 1)) }))}
                >
                  <Text style={styles.stepperBtnText}>+</Text>
                </TouchableOpacity>
              </View>
              {createErrors.capacity && <Text style={styles.fieldError}>{createErrors.capacity}</Text>}

              <TouchableOpacity
                style={[styles.createSubmitBtn, creating && styles.btnDisabled]}
                onPress={handleCreateClass}
                disabled={creating}
              >
                {creating
                  ? <ActivityIndicator size="small" color={C.cream} />
                  : <Text style={styles.createSubmitBtnText}>CREATE CLASS</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    marginTop: 8,
  },
  newClassBtn: {
    borderWidth: 1,
    borderColor: C.burg,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  newClassBtnText: {
    fontFamily: F.sansMed,
    fontSize: 10,
    color: C.burg,
    letterSpacing: 1,
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
  // Create Class Modal
  modalSafe: {
    flex: 1,
    backgroundColor: C.cream,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  modalTitle: {
    fontFamily: F.serifReg,
    fontSize: 20,
    color: C.ink,
  },
  modalCancel: {
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.midGray,
  },
  modalSave: {
    fontFamily: F.sansMed,
    fontSize: 14,
    color: C.burg,
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 48,
  },
  fieldLabel: {
    fontFamily: F.sansMed,
    fontSize: 9,
    color: C.midGray,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 16,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.ink,
    backgroundColor: C.warmWhite,
  },
  fieldInputTouchable: {
    justifyContent: 'center',
  },
  fieldInputText: {
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.ink,
  },
  fieldInputError: {
    borderColor: C.red,
  },
  fieldError: {
    fontFamily: F.sansReg,
    fontSize: 11,
    color: C.red,
    marginTop: 4,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.warmWhite,
  },
  stepperBtnText: {
    fontFamily: F.sansMed,
    fontSize: 20,
    color: C.ink,
    lineHeight: 24,
  },
  stepperValue: {
    fontFamily: F.serifBold,
    fontSize: 28,
    color: C.ink,
    minWidth: 32,
    textAlign: 'center',
  },
  createSubmitBtn: {
    height: 50,
    backgroundColor: C.burg,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  createSubmitBtnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.cream,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  // Booking success modal
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  successSheet: {
    backgroundColor: C.cream,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 48,
  },
  successTitle: {
    fontFamily: F.serifBold,
    fontSize: 22,
    color: C.ink,
    marginBottom: 16,
  },
  successDivider: {
    height: 1,
    backgroundColor: C.rule,
    marginBottom: 20,
  },
  successClassName: {
    fontFamily: F.serifBold,
    fontSize: 18,
    color: C.burg,
    marginBottom: 6,
  },
  successMeta: {
    fontFamily: F.sansReg,
    fontSize: 13,
    color: C.midGray,
    marginBottom: 2,
  },
  successReformer: {
    fontFamily: F.sansMed,
    fontSize: 13,
    color: C.ink,
    marginTop: 8,
  },
  calendarBtn: {
    height: 50,
    backgroundColor: C.ink,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  calendarBtnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.cream,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  noThanksBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noThanksBtnText: {
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.midGray,
  },
})
