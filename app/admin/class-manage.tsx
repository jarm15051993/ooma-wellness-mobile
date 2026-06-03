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
  TextInput,
  Alert,
  Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { format, addMinutes } from 'date-fns'
import DateTimePicker from '@react-native-community/datetimepicker'
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

type ClassLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'

type ClassInfo = {
  id: string
  title: string
  startTime: string
  endTime: string
  capacity: number
  instructor: string | null
  classType: 'REFORMER' | 'YOGA'
  level: ClassLevel | null
}

type EditForm = {
  title: string
  instructor: string
  classType: 'REFORMER' | 'YOGA'
  level: ClassLevel | null
  startTime: Date
  durationMins: number
  capacity: string
}

function buildForm(cls: ClassInfo): EditForm {
  const start = new Date(cls.startTime)
  const end = new Date(cls.endTime)
  const durationMins = Math.round((end.getTime() - start.getTime()) / 60000)
  return {
    title: cls.title,
    instructor: cls.instructor ?? '',
    classType: cls.classType,
    level: cls.level ?? null,
    startTime: start,
    durationMins,
    capacity: String(cls.capacity),
  }
}

const DURATION_OPTIONS = Array.from({ length: 16 }, (_, i) => 30 + i * 10)

export default function ClassManageScreen() {
  const { classId } = useLocalSearchParams<{ classId: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [cls, setCls] = useState<ClassInfo | null>(null)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<Attendee | null>(null)

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Edit state
  const [showEditModal, setShowEditModal] = useState(false)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [showLevelPicker, setShowLevelPicker] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editErrors, setEditErrors] = useState<Partial<Record<keyof EditForm, string>>>({})

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

  async function handleDelete() {
    if (!cls) return
    setDeleting(true)
    try {
      await api.delete(`/api/admin/classes/${cls.id}`)
      router.back()
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Something went wrong'
      Alert.alert('Error', msg)
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  function openEdit() {
    if (!cls) return
    setEditForm(buildForm(cls))
    setEditErrors({})
    setShowEditModal(true)
  }

  function validateEdit(): boolean {
    if (!editForm) return false
    const errs: Partial<Record<keyof EditForm, string>> = {}
    if (!editForm.title.trim()) errs.title = 'Class name is required'
    const cap = parseInt(editForm.capacity)
    if (isNaN(cap) || cap < 1 || cap > 20) errs.capacity = 'Spots must be between 1 and 20'
    if (cap < attendees.length) errs.capacity = `Cannot reduce to ${cap} — ${attendees.length} people are enrolled`
    setEditErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSavePress() {
    if (!validateEdit()) return
    if (attendees.length > 0) {
      setShowConfirm(true)
    } else {
      submitEdit()
    }
  }

  async function submitEdit() {
    if (!editForm || !cls) return
    setSaving(true)
    setShowConfirm(false)
    try {
      const startTime = editForm.startTime
      const endTime = addMinutes(startTime, editForm.durationMins)
      await api.patch(`/api/admin/classes/${cls.id}`, {
        title: editForm.title.trim(),
        instructor: editForm.instructor.trim() || null,
        classType: editForm.classType,
        level: editForm.level,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        capacity: parseInt(editForm.capacity),
      })
      setShowEditModal(false)
      setLoading(true)
      await fetchAttendees()
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Something went wrong'
      Alert.alert('Error', msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={C.burg} />
      </SafeAreaView>
    )
  }

  const hasEnrolled = attendees.length > 0
  const classTypeLocked = hasEnrolled

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
            <View style={styles.classHeaderTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.classTitle}>{cls.title}</Text>
                <Text style={styles.classMeta}>
                  {format(new Date(cls.startTime), 'EEE, MMM d · h:mm a')} –{' '}
                  {format(new Date(cls.endTime), 'h:mm a')}
                </Text>
                {cls.instructor ? (
                  <Text style={styles.classMeta}>{cls.instructor}</Text>
                ) : null}
                <Text style={styles.attendeeCount}>
                  {attendees.length} / {cls.capacity} {attendees.length === 1 ? 'participant' : 'participants'}
                </Text>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.editBtn} onPress={openEdit}>
                  <Text style={styles.editBtnText}>EDIT</Text>
                </TouchableOpacity>
                {!hasEnrolled && (
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => setShowDeleteConfirm(true)}>
                    <Text style={styles.deleteBtnText}>DELETE</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
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

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Scan QR button */}
      {cls && (() => {
        const now = new Date()
        const start = new Date(cls.startTime)
        const end   = new Date(cls.endTime)
        const windowOpen = new Date(start.getTime() - 2 * 60 * 60 * 1000)
        const isActive  = now >= windowOpen && now <= end
        const isEnded   = now > end

        if (isEnded) {
          return (
            <View style={styles.fixedBottom}>
              <View style={[styles.scanBtn, styles.scanBtnDisabled]}>
                <Text style={styles.scanBtnTextDisabled}>CLASS HAS ENDED</Text>
              </View>
            </View>
          )
        }

        if (!isActive) {
          return (
            <View style={styles.fixedBottom}>
              <View style={[styles.scanBtn, styles.scanBtnDisabled]}>
                <Text style={styles.scanBtnTextDisabled}>
                  VALIDATION OPENS AT {format(windowOpen, 'h:mm a')}
                </Text>
              </View>
            </View>
          )
        }

        return (
          <View style={styles.fixedBottom}>
            <TouchableOpacity
              style={styles.scanBtn}
              onPress={() =>
                router.push({
                  pathname: '/admin/qr-scanner',
                  params: { classId, attendees: JSON.stringify(attendees) },
                })
              }
            >
              <Text style={styles.scanBtnText}>SCAN QR TO VALIDATE</Text>
            </TouchableOpacity>
          </View>
        )
      })()}

      {/* Attendee detail bottom sheet */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelected(null)} />
        {selected && (
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetName}>{selected.user.fullName}</Text>
              <View style={[styles.statusBadge, selected.status === 'attended' ? styles.statusAttended : styles.statusConfirmed]}>
                <Text style={[styles.statusText, selected.status === 'attended' ? styles.statusTextAttended : styles.statusTextConfirmed]}>
                  {selected.status === 'attended' ? 'ATTENDED' : 'CONFIRMED'}
                </Text>
              </View>
            </View>
            <Text style={styles.sheetSubLabel}>Reformer</Text>
            <Text style={styles.sheetSubValue}>{selected.stretcherNumber}</Text>
            <Text style={styles.sheetSubLabel}>Goals</Text>
            <Text style={styles.sheetSubValue}>{selected.user.goals ?? 'Not provided'}</Text>
            <Text style={styles.sheetSubLabel}>Health Conditions</Text>
            <Text style={styles.sheetSubValue}>{selected.user.healthConditions ?? 'None noted'}</Text>
            <TouchableOpacity style={styles.sheetClose} onPress={() => setSelected(null)}>
              <Text style={styles.sheetCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>

      {/* Edit modal */}
      {editForm && (
        <Modal visible={showEditModal} animationType="slide" onRequestClose={() => setShowEditModal(false)}>
          <SafeAreaView style={styles.editSafe}>
            {/* Fixed header — outside ScrollView so it never scrolls away */}
            <View style={[styles.editHeader, { paddingTop: insets.top + 12 }]}>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Text style={styles.editHeaderCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.editHeaderTitle}>Edit Class</Text>
              <TouchableOpacity onPress={handleSavePress} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color={C.burg} />
                  : <Text style={styles.editHeaderSave}>Save</Text>
                }
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.editScroll} keyboardShouldPersistTaps="handled">
              {hasEnrolled && (
                <View style={styles.warningBanner}>
                  <Text style={styles.warningText}>
                    {attendees.length} {attendees.length === 1 ? 'person is' : 'people are'} enrolled. They will not be notified of changes.
                  </Text>
                </View>
              )}

              {/* Title */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>CLASS NAME</Text>
                <TextInput
                  style={[styles.fieldInput, editErrors.title ? styles.fieldInputError : null]}
                  value={editForm.title}
                  onChangeText={v => setEditForm(f => f ? { ...f, title: v } : f)}
                  placeholder="e.g. Reformer Pilates"
                  placeholderTextColor={C.lightGray}
                />
                {editErrors.title ? <Text style={styles.fieldError}>{editErrors.title}</Text> : null}
              </View>

              {/* Instructor */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>INSTRUCTOR (optional)</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editForm.instructor}
                  onChangeText={v => setEditForm(f => f ? { ...f, instructor: v } : f)}
                  placeholder="e.g. Sofia M."
                  placeholderTextColor={C.lightGray}
                />
              </View>

              {/* Class type */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>CLASS TYPE</Text>
                <View style={styles.typeRow}>
                  {(['REFORMER', 'YOGA'] as const).map(t => {
                    const active = editForm.classType === t
                    return (
                      <TouchableOpacity
                        key={t}
                        style={[styles.typeBtn, active && styles.typeBtnActive, classTypeLocked && styles.typeBtnLocked]}
                        onPress={() => !classTypeLocked && setEditForm(f => f ? { ...f, classType: t } : f)}
                        disabled={classTypeLocked}
                      >
                        <Text style={[styles.typeBtnText, active && styles.typeBtnTextActive]}>
                          {t === 'REFORMER' ? 'Reformer' : 'Yoga'}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
                {classTypeLocked && (
                  <Text style={styles.fieldHint}>Class type cannot be changed while people are enrolled.</Text>
                )}
              </View>

              {/* Level */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>LEVEL</Text>
                <TouchableOpacity style={styles.fieldInput} onPress={() => setShowLevelPicker(true)}>
                  <Text style={[styles.fieldInputText, !editForm.level && { color: C.lightGray }]}>
                    {editForm.level
                      ? editForm.level.charAt(0) + editForm.level.slice(1).toLowerCase()
                      : 'None'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Start time */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>START TIME</Text>
                <TouchableOpacity style={styles.fieldInput} onPress={() => setShowTimePicker(true)}>
                  <Text style={styles.fieldInputText}>{format(editForm.startTime, 'EEE, MMM d · h:mm a')}</Text>
                </TouchableOpacity>
                {showTimePicker && (
                  <DateTimePicker
                    value={editForm.startTime}
                    mode="datetime"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    minimumDate={new Date()}
                    onChange={(_, date) => {
                      setShowTimePicker(Platform.OS === 'ios')
                      if (date) setEditForm(f => f ? { ...f, startTime: date } : f)
                    }}
                  />
                )}
              </View>

              {/* Duration */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>DURATION</Text>
                <View style={styles.durationRow}>
                  <TouchableOpacity
                    style={styles.durationBtn}
                    onPress={() => setEditForm(f => {
                      if (!f) return f
                      const idx = DURATION_OPTIONS.indexOf(f.durationMins)
                      return { ...f, durationMins: idx > 0 ? DURATION_OPTIONS[idx - 1] : f.durationMins }
                    })}
                  >
                    <Text style={styles.durationBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.durationValue}>{editForm.durationMins} min</Text>
                  <TouchableOpacity
                    style={styles.durationBtn}
                    onPress={() => setEditForm(f => {
                      if (!f) return f
                      const idx = DURATION_OPTIONS.indexOf(f.durationMins)
                      return { ...f, durationMins: idx < DURATION_OPTIONS.length - 1 ? DURATION_OPTIONS[idx + 1] : f.durationMins }
                    })}
                  >
                    <Text style={styles.durationBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Capacity */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>SPOTS</Text>
                <View style={styles.durationRow}>
                  <TouchableOpacity
                    style={styles.durationBtn}
                    onPress={() => setEditForm(f => {
                      if (!f) return f
                      const v = Math.max(1, parseInt(f.capacity) - 1)
                      return { ...f, capacity: String(v) }
                    })}
                  >
                    <Text style={styles.durationBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.durationValue}>{editForm.capacity}</Text>
                  <TouchableOpacity
                    style={styles.durationBtn}
                    onPress={() => setEditForm(f => {
                      if (!f) return f
                      const v = Math.min(20, parseInt(f.capacity) + 1)
                      return { ...f, capacity: String(v) }
                    })}
                  >
                    <Text style={styles.durationBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
                {editErrors.capacity ? <Text style={styles.fieldError}>{editErrors.capacity}</Text> : null}
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}

      {/* Delete confirmation modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Delete class?</Text>
            <Text style={styles.confirmBody}>
              This will permanently remove the class. This cannot be undone.
            </Text>
            <TouchableOpacity style={styles.deleteBtnFilled} onPress={handleDelete} disabled={deleting}>
              {deleting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.confirmBtnText}>Delete</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmCancel} onPress={() => setShowDeleteConfirm(false)} disabled={deleting}>
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit confirm modal */}
      <Modal visible={showConfirm} transparent animationType="fade">
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Save changes?</Text>
            <Text style={styles.confirmBody}>
              {attendees.length} {attendees.length === 1 ? 'person is' : 'people are'} enrolled in this class.
              They will not be notified automatically.
            </Text>
            <TouchableOpacity style={styles.confirmBtn} onPress={submitEdit} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.confirmBtnText}>Confirm changes</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmCancel} onPress={() => setShowConfirm(false)}>
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Level picker */}
      <Modal visible={showLevelPicker} transparent animationType="fade" onRequestClose={() => setShowLevelPicker(false)}>
        <TouchableOpacity style={styles.pickerBackdrop} activeOpacity={1} onPress={() => setShowLevelPicker(false)}>
          <View style={styles.pickerSheet}>
            {([null, 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const).map(lvl => (
              <TouchableOpacity
                key={lvl ?? 'none'}
                style={[styles.pickerOption, editForm?.level === lvl && styles.pickerOptionActive]}
                onPress={() => {
                  setEditForm(f => f ? { ...f, level: lvl } : f)
                  setShowLevelPicker(false)
                }}
              >
                <Text style={[styles.pickerOptionText, editForm?.level === lvl && styles.pickerOptionTextActive]}>
                  {lvl === null ? 'None' : lvl.charAt(0) + lvl.slice(1).toLowerCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
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
  classHeaderTop: { flexDirection: 'row', alignItems: 'flex-start' },
  classTitle: { fontFamily: F.serifBold, fontSize: 22, color: C.ink, marginBottom: 6 },
  classMeta: { fontFamily: F.sansReg, fontSize: 12, color: C.midGray, marginBottom: 2 },
  attendeeCount: { fontFamily: F.sansMed, fontSize: 12, color: C.burg, marginTop: 8 },
  headerActions: { flexDirection: 'column', gap: 6, marginLeft: 12, alignSelf: 'flex-start' },
  editBtn: {
    borderWidth: 1,
    borderColor: C.ink,
    borderRadius: 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editBtnText: { fontFamily: F.sansMed, fontSize: 10, color: C.ink, letterSpacing: 1 },
  deleteBtn: {
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  deleteBtnText: { fontFamily: F.sansMed, fontSize: 10, color: '#ef4444', letterSpacing: 1 },
  deleteBtnFilled: {
    backgroundColor: '#ef4444',
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
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
  statusBadge: { borderRadius: 2, paddingHorizontal: 8, paddingVertical: 3 },
  statusConfirmed: { backgroundColor: '#F3F4F6' },
  statusAttended: { backgroundColor: '#DCFCE7' },
  statusText: { fontFamily: F.sansMed, fontSize: 10, letterSpacing: 0.5 },
  statusTextConfirmed: { color: C.midGray },
  statusTextAttended: { color: '#15803D' },
  fixedBottom: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: C.cream,
    borderTopWidth: 1,
    borderTopColor: C.rule,
    padding: 16,
    paddingBottom: 32,
  },
  scanBtn: { height: 48, backgroundColor: C.ink, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  scanBtnDisabled: { backgroundColor: '#E5E7EB' },
  scanBtnText: { fontFamily: F.sansMed, fontSize: 12, color: C.cream, letterSpacing: 2 },
  scanBtnTextDisabled: { fontFamily: F.sansMed, fontSize: 11, color: C.midGray, letterSpacing: 1.5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: C.warmWhite, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24, paddingBottom: 40 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.rule, alignSelf: 'center', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetName: { fontFamily: F.serifBold, fontSize: 20, color: C.ink, flex: 1, marginRight: 12 },
  sheetSubLabel: { fontFamily: F.sansMed, fontSize: 10, color: C.midGray, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  sheetSubValue: { fontFamily: F.sansReg, fontSize: 14, color: C.ink, marginBottom: 16 },
  sheetClose: { height: 44, borderWidth: 1, borderColor: C.rule, borderRadius: 2, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  sheetCloseText: { fontFamily: F.sansMed, fontSize: 12, color: C.ink, letterSpacing: 1 },

  // Edit modal
  editSafe: { flex: 1, backgroundColor: C.cream },
  editScroll: { paddingHorizontal: 20, paddingBottom: 60 },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
    marginBottom: 24,
  },
  editHeaderCancel: { fontFamily: F.sansReg, fontSize: 14, color: C.midGray },
  editHeaderTitle: { fontFamily: F.serifBold, fontSize: 18, color: C.ink },
  editHeaderSave: { fontFamily: F.sansMed, fontSize: 14, color: C.burg },
  warningBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 4,
    padding: 12,
    marginBottom: 20,
  },
  warningText: { fontFamily: F.sansReg, fontSize: 13, color: '#92400E' },
  fieldGroup: { marginBottom: 20 },
  fieldLabel: { fontFamily: F.sansMed, fontSize: 10, color: C.midGray, letterSpacing: 1, marginBottom: 8 },
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
    justifyContent: 'center',
  },
  fieldInputText: { fontFamily: F.sansReg, fontSize: 14, color: C.ink },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: C.warmWhite, borderTopLeftRadius: 12, borderTopRightRadius: 12, paddingBottom: 32 },
  pickerOption: { paddingVertical: 16, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: C.rule },
  pickerOptionActive: { backgroundColor: C.burgPale },
  pickerOptionText: { fontFamily: F.sansReg, fontSize: 15, color: C.ink },
  pickerOptionTextActive: { fontFamily: F.sansMed, color: C.burg },
  fieldInputError: { borderColor: '#ef4444' },
  fieldError: { fontFamily: F.sansReg, fontSize: 12, color: '#ef4444', marginTop: 4 },
  fieldHint: { fontFamily: F.sansReg, fontSize: 11, color: C.midGray, marginTop: 6 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: C.warmWhite,
  },
  typeBtnActive: { backgroundColor: C.ink, borderColor: C.ink },
  typeBtnLocked: { opacity: 0.4 },
  typeBtnText: { fontFamily: F.sansMed, fontSize: 13, color: C.midGray },
  typeBtnTextActive: { color: C.cream },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  durationBtn: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.warmWhite,
  },
  durationBtnText: { fontFamily: F.sansMed, fontSize: 18, color: C.ink },
  durationValue: { fontFamily: F.sansMed, fontSize: 16, color: C.ink, minWidth: 80, textAlign: 'center' },

  // Confirm modal
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  confirmBox: { backgroundColor: C.warmWhite, borderRadius: 12, padding: 24, marginHorizontal: 32, width: '85%' },
  confirmTitle: { fontFamily: F.serifBold, fontSize: 20, color: C.ink, marginBottom: 12 },
  confirmBody: { fontFamily: F.sansReg, fontSize: 14, color: C.midGray, lineHeight: 20, marginBottom: 24 },
  confirmBtn: { backgroundColor: C.ink, borderRadius: 4, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  confirmBtnText: { fontFamily: F.sansMed, fontSize: 13, color: C.cream, letterSpacing: 1 },
  confirmCancel: { paddingVertical: 10, alignItems: 'center' },
  confirmCancelText: { fontFamily: F.sansMed, fontSize: 13, color: C.midGray },
})
