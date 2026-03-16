import { useState, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, FlatList, ScrollView,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import { C, F } from '@/constants/theme'
import { COUNTRY_CODES, PHONE_LENGTHS, CONDITIONS, MONTHS } from '@/constants/onboarding'
import WalletModal from '@/components/WalletModal'

const STEPS = [
  'Create your password',
  'Tell us about yourself',
  'How can we reach you?',
  "What's your goal",
  'A little more about you',
]

const MIN_YEAR = 1940
const MAX_YEAR = new Date().getFullYear() - 14

function daysInMonth(month: number, year: number) {
  if (!month || !year) return 31
  return new Date(year, month, 0).getDate()
}

export default function CompleteProfileScreen() {
  const params = useLocalSearchParams<{ userId: string; email: string }>()
  const userId = params.userId
  const email = params.email ? decodeURIComponent(params.email) : ''
  const { signIn, token, refreshUser } = useAuth()
  const router = useRouter()

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showWalletModal, setShowWalletModal] = useState(false)

  // Step 0 — password
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Step 1 — name
  const [name, setName] = useState('')
  const [lastName, setLastName] = useState('')

  // Step 2 — phone
  const [countryCode, setCountryCode] = useState('+34')
  const [phone, setPhone] = useState('')
  const [countryPickerVisible, setCountryPickerVisible] = useState(false)

  // Step 3 — goals
  const [goals, setGoals] = useState('')

  // Step 4 — birthday + conditions + disclaimer
  const [birthMonth, setBirthMonth] = useState('')
  const [birthDay, setBirthDay] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [hasConditions, setHasConditions] = useState<boolean | null>(null)
  const [selectedConditions, setSelectedConditions] = useState<string[]>([])
  const [conditionOther, setConditionOther] = useState('')
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false)
  const [monthPickerVisible, setMonthPickerVisible] = useState(false)
  const [dayPickerVisible, setDayPickerVisible] = useState(false)
  const [yearPickerVisible, setYearPickerVisible] = useState(false)

  const scrollRef = useRef<ScrollView>(null)

  function scrollTop() {
    scrollRef.current?.scrollTo({ y: 0, animated: false })
  }

  function validate(): string | null {
    if (step === 0) {
      if (!password) return 'Please enter a password.'
      if (password.length < 8) return 'Password must be at least 8 characters.'
      if (!/[A-Z]/.test(password)) return 'Password must contain at least one capital letter.'
      if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character.'
      if (password !== confirmPassword) return 'Passwords do not match.'
    }
    if (step === 1) {
      if (!name.trim()) return 'Please enter your first name.'
      if (!lastName.trim()) return 'Please enter your last name.'
    }
    if (step === 2) {
      if (!phone.trim()) return 'Please enter your phone number.'
      const lengths = PHONE_LENGTHS[countryCode]
      if (lengths) {
        const digits = phone.replace(/\D/g, '')
        if (digits.length < lengths.min || digits.length > lengths.max) {
          return lengths.min === lengths.max
            ? `Phone must be exactly ${lengths.min} digits for ${countryCode}.`
            : `Phone must be ${lengths.min}–${lengths.max} digits for ${countryCode}.`
        }
      }
    }
    if (step === 3) {
      if (!goals.trim()) return 'Please tell us your goal.'
    }
    if (step === 4) {
      if (!birthMonth || !birthDay || !birthYear) return 'Please enter your birthday.'
      if (hasConditions === null) return 'Please answer the health conditions question.'
      if (hasConditions && selectedConditions.length === 0) return 'Please select at least one condition.'
      if (hasConditions && selectedConditions.includes('Other') && !conditionOther.trim()) {
        return 'Please describe your other condition.'
      }
      if (!disclaimerAccepted) return 'Please accept the Health & Liability Disclaimer.'
    }
    return null
  }

  async function handleNext() {
    const err = validate()
    if (err) { setError(err); return }
    setError('')

    if (step === 2) {
      // Check phone uniqueness before advancing
      const fullPhone = countryCode + phone.replace(/\D/g, '')
      setLoading(true)
      try {
        const { data } = await api.get(
          `/api/user/check-phone?phone=${encodeURIComponent(fullPhone)}&excludeUserId=${userId}`
        )
        if (data.taken) {
          setError('That phone number is already registered.')
          setLoading(false)
          return
        }
      } catch {
        // Non-critical — let backend catch it at submit
      } finally {
        setLoading(false)
      }
    }

    if (step < STEPS.length - 1) {
      setStep(s => s + 1)
      scrollTop()
    } else {
      await handleSubmit()
    }
  }

  function handleBack() {
    setError('')
    setStep(s => s - 1)
    scrollTop()
  }

  async function handleSubmit() {
    setLoading(true)
    const fullPhone = countryCode + phone.replace(/\D/g, '')
    const monthNum = MONTHS.indexOf(birthMonth) + 1
    const birthday = `${birthYear}-${String(monthNum).padStart(2, '0')}-${birthDay.padStart(2, '0')}`

    let additionalInfo: string | null = null
    if (hasConditions) {
      const parts = selectedConditions.filter(c => c !== 'Other')
      if (selectedConditions.includes('Other') && conditionOther.trim()) {
        parts.push(`Other: ${conditionOther.trim()}`)
      }
      additionalInfo = parts.join(', ') || null
    }

    // Step 1: complete onboarding
    let confirmedEmail = email.trim().toLowerCase()
    try {
      const { data } = await api.patch('/api/user/complete-onboarding', {
        userId,
        password,
        name: name.trim(),
        lastName: lastName.trim(),
        phone: fullPhone,
        goals: goals.trim(),
        birthday,
        additionalInfo,
      })
      // Use the email from the server response to avoid any URL param encoding issues
      if (data?.user?.email) confirmedEmail = data.user.email.trim().toLowerCase()
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.response?.data?.error
      setError(msg ?? 'Could not complete sign-up. Please try again.')
      setLoading(false)
      return
    }

    // Step 2: establish session
    try {
      if (token) {
        // Already authenticated (came via guard redirect) — just refresh user state
        await refreshUser()
      } else {
        // Coming from activation link — no token yet, sign in with new password
        await signIn(confirmedEmail, password)
      }
      setShowWalletModal(true)
    } catch {
      Alert.alert(
        'Account created',
        'Your profile was saved. Please log in to continue.',
        [{ text: 'Log in', onPress: () => router.replace('/(auth)/login') }]
      )
    } finally {
      setLoading(false)
    }
  }

  function toggleCondition(c: string) {
    setSelectedConditions(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    )
  }

  const years = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => String(MAX_YEAR - i))
  const maxDay = daysInMonth(MONTHS.indexOf(birthMonth) + 1, parseInt(birthYear))
  const days = Array.from({ length: maxDay }, (_, i) => String(i + 1))

  const selectedCountry = COUNTRY_CODES.find(c => c.code === countryCode)

  return (
    <SafeAreaView style={styles.container}>
      <WalletModal
        visible={showWalletModal}
        userId={userId}
        onDismiss={() => {
          setShowWalletModal(false)
          router.replace('/(tabs)/')
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Progress bar */}
        <View style={styles.progressBar}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressDot,
                i === step ? styles.progressActive : i < step ? styles.progressDone : styles.progressPending,
              ]}
            />
          ))}
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.stepHeading}>{STEPS[step]}</Text>

          {/* ─── Step 0: Password ─── */}
          {step === 0 && (
            <View>
              <Text style={styles.fieldLabel}>PASSWORD</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, styles.inputFlex]}
                  value={password}
                  onChangeText={t => { setPassword(t); setError('') }}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  placeholderTextColor={C.lightGray}
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(v => !v)}>
                  <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>8+ characters, one capital, one special character</Text>

              <Text style={styles.fieldLabel}>CONFIRM PASSWORD</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, styles.inputFlex]}
                  value={confirmPassword}
                  onChangeText={t => { setConfirmPassword(t); setError('') }}
                  secureTextEntry={!showConfirm}
                  autoComplete="new-password"
                  placeholderTextColor={C.lightGray}
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirm(v => !v)}>
                  <Text style={styles.eyeIcon}>{showConfirm ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ─── Step 1: Name ─── */}
          {step === 1 && (
            <View>
              <Text style={styles.fieldLabel}>FIRST NAME</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={t => { setName(t); setError('') }}
                autoCapitalize="words"
                placeholderTextColor={C.lightGray}
              />
              <Text style={styles.fieldLabel}>LAST NAME</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={t => { setLastName(t); setError('') }}
                autoCapitalize="words"
                placeholderTextColor={C.lightGray}
              />
            </View>
          )}

          {/* ─── Step 2: Phone ─── */}
          {step === 2 && (
            <View>
              <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
              <View style={styles.phoneRow}>
                <TouchableOpacity
                  style={styles.countryPicker}
                  onPress={() => setCountryPickerVisible(true)}
                >
                  <Text style={styles.countryText}>
                    {selectedCountry?.flag} {countryCode}
                  </Text>
                  <Text style={styles.chevron}>▾</Text>
                </TouchableOpacity>
                <TextInput
                  style={[styles.input, styles.phoneInput]}
                  value={phone}
                  onChangeText={t => { setPhone(t.replace(/\D/g, '')); setError('') }}
                  keyboardType="phone-pad"
                  placeholderTextColor={C.lightGray}
                />
              </View>
              {PHONE_LENGTHS[countryCode] && (
                <Text style={styles.hint}>
                  {PHONE_LENGTHS[countryCode].min === PHONE_LENGTHS[countryCode].max
                    ? `${PHONE_LENGTHS[countryCode].min} digits required`
                    : `${PHONE_LENGTHS[countryCode].min}–${PHONE_LENGTHS[countryCode].max} digits required`}
                </Text>
              )}
            </View>
          )}

          {/* ─── Step 3: Goals ─── */}
          {step === 3 && (
            <View>
              <Text style={styles.fieldLabel}>YOUR GOAL</Text>
              <TextInput
                style={styles.textArea}
                value={goals}
                onChangeText={t => { setGoals(t); setError('') }}
                multiline
                numberOfLines={4}
                placeholderTextColor={C.lightGray}
                textAlignVertical="top"
              />
            </View>
          )}

          {/* ─── Step 4: Birthday + Conditions + Disclaimer ─── */}
          {step === 4 && (
            <View>
              <Text style={styles.fieldLabel}>BIRTHDAY</Text>
              <View style={styles.birthdayRow}>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setMonthPickerVisible(true)}>
                  <Text style={[styles.dateBtnText, !birthMonth && styles.datePlaceholder]}>
                    {birthMonth || 'Month'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setDayPickerVisible(true)}>
                  <Text style={[styles.dateBtnText, !birthDay && styles.datePlaceholder]}>
                    {birthDay || 'Day'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setYearPickerVisible(true)}>
                  <Text style={[styles.dateBtnText, !birthYear && styles.datePlaceholder]}>
                    {birthYear || 'Year'}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>DO YOU HAVE ANY INJURIES OR SPECIAL CONDITIONS?</Text>
              <View style={styles.yesNoRow}>
                <TouchableOpacity
                  style={[styles.yesNoBtn, hasConditions === false && styles.yesNoBtnActive]}
                  onPress={() => { setHasConditions(false); setSelectedConditions([]) }}
                >
                  <Text style={[styles.yesNoText, hasConditions === false && styles.yesNoTextActive]}>NO</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.yesNoBtn, hasConditions === true && styles.yesNoBtnActive]}
                  onPress={() => setHasConditions(true)}
                >
                  <Text style={[styles.yesNoText, hasConditions === true && styles.yesNoTextActive]}>YES</Text>
                </TouchableOpacity>
              </View>

              {hasConditions === true && (
                <View style={styles.conditionsGrid}>
                  <Text style={styles.selectAllLabel}>SELECT ALL THAT APPLY</Text>
                  <View style={styles.conditionsRow}>
                    {CONDITIONS.map(c => (
                      <TouchableOpacity
                        key={c}
                        style={[styles.conditionChip, selectedConditions.includes(c) && styles.conditionChipActive]}
                        onPress={() => toggleCondition(c)}
                      >
                        <Text style={[styles.conditionText, selectedConditions.includes(c) && styles.conditionTextActive]}>
                          {selectedConditions.includes(c) ? '☑ ' : '☐ '}{c}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[styles.conditionChipWide, selectedConditions.includes('Other') && styles.conditionChipActive]}
                      onPress={() => toggleCondition('Other')}
                    >
                      <Text style={[styles.conditionText, selectedConditions.includes('Other') && styles.conditionTextActive]}>
                        {selectedConditions.includes('Other') ? '☑ ' : '☐ '}Other (specify)
                      </Text>
                    </TouchableOpacity>
                    {selectedConditions.includes('Other') && (
                      <TextInput
                        style={styles.otherInput}
                        value={conditionOther}
                        onChangeText={setConditionOther}
                        placeholder="Please describe..."
                        placeholderTextColor={C.lightGray}
                      />
                    )}
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={styles.disclaimerRow}
                onPress={() => setDisclaimerAccepted(v => !v)}
              >
                <View style={[styles.checkbox, disclaimerAccepted && styles.checkboxActive]}>
                  {disclaimerAccepted && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.disclaimerText}>
                  I have read and acknowledge the Health & Liability Disclaimer
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Navigation buttons */}
          <View style={styles.navRow}>
            {step > 0 && (
              <TouchableOpacity style={styles.backBtn} onPress={handleBack} disabled={loading}>
                <Text style={styles.backBtnText}>BACK</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.nextBtn, step === 0 && styles.nextBtnFull, loading && styles.btnDisabled]}
              onPress={handleNext}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={C.cream} />
                : <Text style={styles.nextBtnText}>
                    {step === STEPS.length - 1 ? "LET'S GO!" : 'CONTINUE'}
                  </Text>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Country code picker modal */}
      <PickerModal
        visible={countryPickerVisible}
        onClose={() => setCountryPickerVisible(false)}
        title="Select country code"
        items={COUNTRY_CODES.map(c => ({ key: c.code, label: `${c.flag} ${c.label}` }))}
        onSelect={key => { setCountryCode(key); setPhone('') }}
      />

      {/* Month picker modal */}
      <PickerModal
        visible={monthPickerVisible}
        onClose={() => setMonthPickerVisible(false)}
        title="Select month"
        items={MONTHS.map(m => ({ key: m, label: m }))}
        onSelect={key => setBirthMonth(key)}
      />

      {/* Day picker modal */}
      <PickerModal
        visible={dayPickerVisible}
        onClose={() => setDayPickerVisible(false)}
        title="Select day"
        items={days.map(d => ({ key: d, label: d }))}
        onSelect={key => setBirthDay(key)}
      />

      {/* Year picker modal */}
      <PickerModal
        visible={yearPickerVisible}
        onClose={() => setYearPickerVisible(false)}
        title="Select year"
        items={years.map(y => ({ key: y, label: y }))}
        onSelect={key => setBirthYear(key)}
      />
    </SafeAreaView>
  )
}

// ─── Reusable picker modal ───────────────────────────────────────────────────
function PickerModal({
  visible, onClose, title, items, onSelect,
}: {
  visible: boolean
  onClose: () => void
  title: string
  items: { key: string; label: string }[]
  onSelect: (key: string) => void
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={modal.overlay} activeOpacity={1} onPress={onClose} />
      <View style={modal.sheet}>
        <Text style={modal.title}>{title}</Text>
        <FlatList
          data={items}
          keyExtractor={i => i.key}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={modal.item}
              onPress={() => { onSelect(item.key); onClose() }}
            >
              <Text style={modal.itemText}>{item.label}</Text>
            </TouchableOpacity>
          )}
          showsVerticalScrollIndicator={false}
          style={{ maxHeight: 320 }}
        />
      </View>
    </Modal>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },
  scroll: { paddingHorizontal: 28, paddingBottom: 40, paddingTop: 8 },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 16,
  },
  progressDot: { height: 4, borderRadius: 2 },
  progressActive: { width: 24, backgroundColor: C.burg },
  progressDone: { width: 8, backgroundColor: C.burgPale },
  progressPending: { width: 8, backgroundColor: C.rule },
  stepHeading: {
    fontFamily: F.serif,
    fontSize: 26,
    color: C.ink,
    textAlign: 'center',
    marginBottom: 28,
    marginTop: 8,
  },
  fieldLabel: {
    fontFamily: F.sansMed,
    fontSize: 10,
    color: C.midGray,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 2,
    paddingHorizontal: 14,
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.ink,
    backgroundColor: C.warmWhite,
    marginBottom: 16,
  },
  inputFlex: { flex: 1, marginBottom: 0 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  eyeBtn: {
    position: 'absolute',
    right: 0,
    height: 48,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeIcon: { fontSize: 16 },
  hint: {
    fontFamily: F.sansReg,
    fontSize: 11,
    color: C.midGray,
    marginTop: -10,
    marginBottom: 16,
  },
  textArea: {
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 2,
    paddingHorizontal: 14,
    paddingTop: 12,
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.ink,
    backgroundColor: C.warmWhite,
    minHeight: 120,
    marginBottom: 16,
  },
  phoneRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  countryPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 2,
    paddingHorizontal: 12,
    backgroundColor: C.warmWhite,
    gap: 4,
  },
  countryText: { fontFamily: F.sansReg, fontSize: 14, color: C.ink },
  chevron: { fontSize: 12, color: C.midGray },
  phoneInput: { flex: 1, marginBottom: 0 },
  birthdayRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  dateBtn: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.warmWhite,
  },
  dateBtnText: { fontFamily: F.sansReg, fontSize: 14, color: C.ink },
  datePlaceholder: { color: C.lightGray },
  yesNoRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  yesNoBtn: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yesNoBtnActive: { borderColor: C.burg, backgroundColor: C.burg },
  yesNoText: { fontFamily: F.sansMed, fontSize: 12, color: C.ink, letterSpacing: 2 },
  yesNoTextActive: { color: C.cream },
  conditionsGrid: { marginBottom: 16 },
  selectAllLabel: {
    fontFamily: F.sansMed,
    fontSize: 9,
    color: C.midGray,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  conditionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  conditionChip: {
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '47%',
  },
  conditionChipWide: {
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '100%',
  },
  conditionChipActive: { borderColor: C.burg, backgroundColor: C.burgPale },
  conditionText: { fontFamily: F.sansReg, fontSize: 13, color: C.ink },
  conditionTextActive: { color: C.burg, fontFamily: F.sansMed },
  otherInput: {
    width: '100%',
    height: 44,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 2,
    paddingHorizontal: 12,
    fontFamily: F.sansReg,
    fontSize: 14,
    color: C.ink,
    backgroundColor: C.warmWhite,
    marginTop: 4,
  },
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 20,
    marginBottom: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxActive: { backgroundColor: C.burg, borderColor: C.burg },
  checkmark: { color: C.cream, fontSize: 13, fontWeight: '700' },
  disclaimerText: {
    flex: 1,
    fontFamily: F.sansReg,
    fontSize: 13,
    color: C.ink,
    lineHeight: 20,
  },
  errorText: {
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.red,
    marginBottom: 12,
    textAlign: 'center',
  },
  navRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  backBtn: {
    flex: 1,
    height: 50,
    borderWidth: 1,
    borderColor: C.ink,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontFamily: F.sansMed,
    fontSize: 12,
    color: C.ink,
    letterSpacing: 3,
  },
  nextBtn: {
    flex: 1,
    height: 50,
    backgroundColor: C.ink,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnFull: { flex: 1 },
  btnDisabled: { opacity: 0.6 },
  nextBtnText: {
    fontFamily: F.sansMed,
    fontSize: 12,
    color: C.cream,
    letterSpacing: 3,
  },
})

const modal = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: C.warmWhite,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
  },
  title: {
    fontFamily: F.sansMed,
    fontSize: 12,
    color: C.midGray,
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 12,
  },
  item: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  itemText: {
    fontFamily: F.sansReg,
    fontSize: 15,
    color: C.ink,
  },
})
