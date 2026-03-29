import React, { useState, useCallback } from 'react'
import * as Calendar from 'expo-calendar'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import Papa from 'papaparse'
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

const DURATION_OPTIONS = [
  { label: '60 minutes', value: '60' },
  { label: '90 minutes', value: '90' },
]

function nextHour(): Date {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  return d
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

// ─── CSV Template ────────────────────────────────────────────────────────────
const CSV_TEMPLATE = `class_name,instructor,date,start_time,duration_mins,capacity
Reformer Pilates,Sofia M.,2025-06-15,09:00,60,6
[DELETE THIS ROW BEFORE UPLOADING],Format: Text,Format: YYYY-MM-DD,Format: HH:MM (24h),60 or 90 only,Max 6
`

// ─── CSV types ────────────────────────────────────────────────────────────────
type ValidCsvRow = {
  title: string
  instructor: string
  date: string
  startTime: string
  durationMins: number
  capacity: number
}

type SkippedCsvRow = {
  rowNum: number
  values: string
  reason: string
}

type CsvPreview = {
  valid: ValidCsvRow[]
  skipped: SkippedCsvRow[]
}

// ─── CSV validation ───────────────────────────────────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

function validateCsvRow(row: Record<string, string>, rowNum: number): { valid: ValidCsvRow } | { skipped: SkippedCsvRow } {
  const title = (row['class_name'] ?? '').trim()
  const instructor = (row['instructor'] ?? '').trim()
  const date = (row['date'] ?? '').trim()
  const startTime = (row['start_time'] ?? '').trim()
  const durationRaw = (row['duration_mins'] ?? '').trim()
  const capacityRaw = (row['capacity'] ?? '').trim()
  const values = [title, instructor, date, startTime, durationRaw, capacityRaw].join(', ')

  if (!title) return { skipped: { rowNum, values, reason: 'Missing class name' } }
  if (!instructor) return { skipped: { rowNum, values, reason: 'Missing instructor' } }
  if (!DATE_RE.test(date)) return { skipped: { rowNum, values, reason: 'Invalid date format (use YYYY-MM-DD)' } }

  const parsedDate = new Date(date + 'T00:00:00')
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0)
  if (isNaN(parsedDate.getTime()) || parsedDate < todayMidnight) {
    return { skipped: { rowNum, values, reason: 'Date is in the past' } }
  }

  if (!TIME_RE.test(startTime)) return { skipped: { rowNum, values, reason: 'Invalid time format (use HH:MM in 24h)' } }

  const dur = parseInt(durationRaw, 10)
  if (isNaN(dur) || (dur !== 60 && dur !== 90)) {
    return { skipped: { rowNum, values, reason: 'Duration must be 60 or 90 minutes' } }
  }

  const cap = parseInt(capacityRaw, 10)
  if (isNaN(cap) || cap < 1 || cap > 6) {
    return { skipped: { rowNum, values, reason: 'Capacity must be between 1 and 6' } }
  }

  return { valid: { title, instructor, date, startTime, durationMins: dur, capacity: cap } }
}

export default function ClassesScreen() {
  const { isAdmin, isOwner, canCreateClass, canBulkUpload, tenantUser } = useAuth()
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

  const [cancellationData, setCancellationData] = useState<{
    title: string
    startTime: string
    endTime: string
  } | null>(null)
  const [removingFromCalendar, setRemovingFromCalendar] = useState(false)

  // Create Class modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState<CreateClassForm>({
    title: '', instructor: '', date: today, startTime: nextHour(),
    durationMins: '60', capacity: '6',
  })
  const [createErrors, setCreateErrors] = useState<CreateClassErrors>({})
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [creating, setCreating] = useState(false)

  const showCreateButton = (canCreateClass || isOwner) && !tenantUser
  const showBulkButtons = (canBulkUpload || isOwner) && !tenantUser

  // CSV upload state
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showSkipped, setShowSkipped] = useState(false)

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
      const classTitle = cancelTarget.title
      const startTime = cancelTarget.startTime
      const endTime = cancelTarget.endTime
      await fetchClasses()
      setCancelTarget(null)
      if (data.creditLost) {
        setToast({ visible: true, message: 'Booking cancelled — credit not returned' })
      } else {
        setCancellationData({ title: classTitle, startTime, endTime })
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error ?? 'Something went wrong')
    } finally {
      setCancelling(false)
    }
  }

  async function handleRemoveFromCalendar() {
    if (!cancellationData) return
    setRemovingFromCalendar(true)
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync()
      if (status !== 'granted') {
        setCancellationData(null)
        setToast({ visible: true, message: 'Calendar access denied. Enable it in Settings.' })
        return
      }
      const start = new Date(cancellationData.startTime)
      const end = new Date(cancellationData.endTime)
      // Search ±1 min window to handle minor time drift
      const searchStart = new Date(start.getTime() - 60_000)
      const searchEnd = new Date(end.getTime() + 60_000)
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)
      const events = await Calendar.getEventsAsync(
        calendars.map(c => c.id),
        searchStart,
        searchEnd,
      )
      const match = events.find(e => e.title === cancellationData.title)
      if (match) {
        await Calendar.deleteEventAsync(match.id)
        setCancellationData(null)
        setToast({ visible: true, message: 'Removed from your calendar' })
      } else {
        setCancellationData(null)
        setToast({ visible: true, message: 'No matching event found in your calendar' })
      }
    } catch {
      Alert.alert('Error', 'Could not remove from calendar. Please try again.')
    } finally {
      setRemovingFromCalendar(false)
    }
  }

  async function handleDownloadTemplate() {
    try {
      const path = FileSystem.cacheDirectory + 'ooma-class-template.csv'
      await FileSystem.writeAsStringAsync(path, CSV_TEMPLATE, { encoding: FileSystem.EncodingType.UTF8 })
      await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Save Class Template' })
    } catch {
      Alert.alert('Error', 'Could not share the template. Please try again.')
    }
  }

  async function handleUploadCSV() {
    let result
    try {
      result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
    } catch {
      Alert.alert('Error', 'This file could not be read. Please check it and try again.')
      return
    }

    if (result.canceled || !result.assets?.[0]) return

    const asset = result.assets[0]
    if (!asset.name.toLowerCase().endsWith('.csv')) {
      Alert.alert('Wrong file type', 'Only CSV files are supported. Please use the provided template.')
      return
    }

    let content: string
    try {
      content = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 })
    } catch {
      Alert.alert('Error', 'This file could not be read. Please check it and try again.')
      return
    }

    if (!content.trim()) {
      Alert.alert('Empty file', 'This file could not be read. Please check it and try again.')
      return
    }

    const parsed = Papa.parse<Record<string, string>>(content, { header: true, skipEmptyLines: true })
    const rows = parsed.data

    if (rows.length > 200) {
      Alert.alert('Too many rows', 'This file contains too many rows. Please upload a maximum of 200 classes at a time.')
      return
    }

    const valid: ValidCsvRow[] = []
    const skipped: SkippedCsvRow[] = []

    rows.forEach((row, i) => {
      const className = (row['class_name'] ?? '').trim()
      // Skip instruction rows silently
      if (className.startsWith('[DELETE') || className.toLowerCase().includes('delete this row')) return

      const rowNum = i + 2 // +2 because row 1 is header
      const result = validateCsvRow(row, rowNum)
      if ('valid' in result) valid.push(result.valid)
      else skipped.push(result.skipped)
    })

    if (valid.length === 0) {
      Alert.alert(
        'No valid classes found',
        'No valid classes were found in this file. Please check your data and try again.',
        [{ text: 'Try Again' }]
      )
      return
    }

    setCsvPreview({ valid, skipped })
    setShowSkipped(false)
    setShowPreview(true)
  }

  async function handleImport() {
    if (!csvPreview) return
    setImporting(true)
    try {
      const { data } = await api.post('/api/admin/classes/bulk', { classes: csvPreview.valid })
      setShowPreview(false)
      setCsvPreview(null)
      await fetchClasses()
      if (data.failed > 0) {
        Alert.alert(
          'Import complete',
          `${data.created} classes imported. ${data.failed} could not be saved — please try adding them manually.`
        )
      } else {
        setToast({ visible: true, message: `${data.created} classes imported successfully` })
      }
    } catch {
      Alert.alert('Import failed', 'Import failed. Please try again.')
    } finally {
      setImporting(false)
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
          {showBulkButtons && (
            <View style={styles.headingBtns}>
              <TouchableOpacity style={styles.newClassBtn} onPress={handleDownloadTemplate}>
                <Text style={styles.newClassBtnText}>↓ TEMPLATE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.newClassBtn} onPress={handleUploadCSV}>
                <Text style={styles.newClassBtnText}>↑ CSV</Text>
              </TouchableOpacity>
            </View>
          )}
          {showCreateButton && (
            <TouchableOpacity style={styles.newClassBtn} onPress={() => {
              setCreateForm({ title: '', instructor: '', date: today, startTime: nextHour(), durationMins: '60', capacity: '6' })
              setCreateErrors({})
              setShowCreateModal(true)
            }}>
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

      {/* Cancellation Calendar Modal */}
      <Modal visible={!!cancellationData} transparent animationType="fade" onRequestClose={() => setCancellationData(null)}>
        <View style={styles.successOverlay}>
          <View style={styles.successSheet}>
            <Text style={styles.successTitle}>Booking Cancelled</Text>
            <View style={styles.successDivider} />

            {cancellationData && (
              <>
                <Text style={styles.successClassName}>{cancellationData.title}</Text>
                <Text style={styles.successMeta}>
                  {new Date(cancellationData.startTime).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </Text>
                <Text style={[styles.successMeta, { marginBottom: 28 }]}>
                  {new Date(cancellationData.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </>
            )}

            <TouchableOpacity
              style={[styles.calendarBtn, removingFromCalendar && styles.btnDisabled]}
              onPress={handleRemoveFromCalendar}
              disabled={removingFromCalendar}
            >
              {removingFromCalendar
                ? <ActivityIndicator size="small" color={C.cream} />
                : <Text style={styles.calendarBtnText}>REMOVE FROM CALENDAR</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={styles.noThanksBtn} onPress={() => setCancellationData(null)} disabled={removingFromCalendar}>
              <Text style={styles.noThanksBtnText}>No thanks</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* CSV Preview Modal */}
      <Modal visible={showPreview} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setShowPreview(false); setCsvPreview(null) }} disabled={importing}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Review Import</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
            {csvPreview && (
              <>
                {/* Summary */}
                <View style={styles.csvSummary}>
                  <Text style={styles.csvSummaryCount}>{csvPreview.valid.length}</Text>
                  <Text style={styles.csvSummaryLabel}>classes ready to import</Text>
                </View>
                {csvPreview.skipped.length > 0 && (
                  <Text style={styles.csvSkippedBanner}>
                    {csvPreview.skipped.length} row{csvPreview.skipped.length !== 1 ? 's' : ''} skipped due to errors
                  </Text>
                )}

                {/* Valid classes list */}
                <Text style={styles.csvSectionLabel}>CLASSES TO IMPORT</Text>
                {csvPreview.valid.map((row, i) => (
                  <View key={i} style={styles.csvValidRow}>
                    <Text style={styles.csvRowTitle}>{row.title}</Text>
                    <Text style={styles.csvRowMeta}>{row.instructor} · {row.date} · {row.startTime} · {row.durationMins} min · {row.capacity} spots</Text>
                  </View>
                ))}

                {/* Skipped rows — collapsed by default */}
                {csvPreview.skipped.length > 0 && (
                  <View style={{ marginTop: 20 }}>
                    <TouchableOpacity style={styles.csvSkippedToggle} onPress={() => setShowSkipped(v => !v)}>
                      <Text style={styles.csvSkippedToggleText}>
                        {showSkipped ? '▾ Hide skipped rows' : `▸ Show skipped rows (${csvPreview.skipped.length})`}
                      </Text>
                    </TouchableOpacity>
                    {showSkipped && csvPreview.skipped.map((row, i) => (
                      <View key={i} style={styles.csvSkippedRow}>
                        <Text style={styles.csvSkippedRowNum}>Row {row.rowNum}</Text>
                        <Text style={styles.csvSkippedValues} numberOfLines={1}>{row.values}</Text>
                        <Text style={styles.csvSkippedReason}>{row.reason}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Import button */}
                <TouchableOpacity
                  style={[styles.createSubmitBtn, importing && styles.btnDisabled, { marginTop: 32 }]}
                  onPress={handleImport}
                  disabled={importing}
                >
                  {importing
                    ? <ActivityIndicator size="small" color={C.cream} />
                    : <Text style={styles.createSubmitBtnText}>IMPORT {csvPreview.valid.length} CLASSES</Text>
                  }
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
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

              <Text style={styles.fieldLabel}>DURATION *</Text>
              <View style={styles.durationRow}>
                {DURATION_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.durationPill, createForm.durationMins === opt.value && styles.durationPillActive]}
                    onPress={() => setCreateForm(f => ({ ...f, durationMins: opt.value }))}
                  >
                    <Text style={[styles.durationPillText, createForm.durationMins === opt.value && styles.durationPillTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

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
  durationRow: {
    flexDirection: 'row',
    gap: 10,
  },
  durationPill: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: C.warmWhite,
  },
  durationPillActive: {
    borderColor: C.burg,
    backgroundColor: C.burgPale,
  },
  durationPillText: {
    fontFamily: F.sansMed,
    fontSize: 13,
    color: C.midGray,
  },
  durationPillTextActive: {
    color: C.burg,
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
  // CSV upload
  headingBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  csvSummary: {
    alignItems: 'center',
    marginBottom: 8,
  },
  csvSummaryCount: {
    fontFamily: F.serifBold,
    fontSize: 48,
    color: C.burg,
    lineHeight: 52,
  },
  csvSummaryLabel: {
    fontFamily: F.sansReg,
    fontSize: 13,
    color: C.midGray,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  csvSkippedBanner: {
    fontFamily: F.sansMed,
    fontSize: 12,
    color: '#92400E',
    backgroundColor: '#FEF9C3',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 20,
    textAlign: 'center',
  },
  csvSectionLabel: {
    fontFamily: F.sansMed,
    fontSize: 9,
    color: C.midGray,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 8,
  },
  csvValidRow: {
    backgroundColor: C.warmWhite,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
  },
  csvRowTitle: {
    fontFamily: F.serifBold,
    fontSize: 15,
    color: C.ink,
    marginBottom: 4,
  },
  csvRowMeta: {
    fontFamily: F.sansReg,
    fontSize: 11,
    color: C.midGray,
  },
  csvSkippedToggle: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  csvSkippedToggleText: {
    fontFamily: F.sansMed,
    fontSize: 12,
    color: C.burg,
    textDecorationLine: 'underline',
  },
  csvSkippedRow: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
  },
  csvSkippedRowNum: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.red,
    letterSpacing: 1,
    marginBottom: 2,
  },
  csvSkippedValues: {
    fontFamily: F.sansReg,
    fontSize: 11,
    color: C.ink,
    marginBottom: 4,
  },
  csvSkippedReason: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.red,
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
