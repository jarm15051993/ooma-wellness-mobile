import { useState, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  ActivityIndicator, Modal, FlatList, ScrollView,
  KeyboardAvoidingView, Platform, Alert, Linking,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import { C, F } from '@/constants/theme'
import { COUNTRY_CODES, PHONE_LENGTHS, CONDITIONS, MONTHS } from '@/constants/onboarding'
import { validateDNI } from '@/utils/validateDNI'
import WalletModal from '@/components/WalletModal'
import GoalSelector from '@/components/GoalSelector'
import { setPendingGift } from '@/lib/pendingGift'
import i18n, { LANGUAGES, type AppLanguage } from '@/lib/i18n'

const MIN_YEAR = 1940
const MAX_YEAR = new Date().getFullYear() - 14

function daysInMonth(month: number, year: number) {
  if (!month || !year) return 31
  return new Date(year, month, 0).getDate()
}

// ─── Disclaimer content ─────────────────────────────────────────────────────

type DisclaimerItem =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: Array<{ bold: string; text: string } | string> }
  | { type: 'subheading'; text: string }
  | { type: 'link'; label: string; href: string }

type DisclaimerSection = {
  number: string
  title: string
  content: DisclaimerItem[]
}

const DISCLAIMER_HEADER = {
  title: 'TÉRMINOS Y CONDICIONES DEL SERVICIO\nOOMA WELLNESS CLUB',
  meta: '',
  legal: '',
  notice: '',
}

const DISCLAIMER_SECTIONS: DisclaimerSection[] = [
  {
    number: '01',
    title: 'Objeto',
    content: [
      { type: 'paragraph', text: 'Los presentes Términos y Condiciones regulan el acceso, la reserva y la participación en las actividades ofrecidas por OOMA Wellness Club, así como el uso de sus instalaciones y servicios asociados.' },
      { type: 'paragraph', text: 'El registro en la plataforma web o app, así como la reserva de actividades, implican la aceptación plena y sin reservas de las presentes condiciones.' },
    ],
  },
  {
    number: '02',
    title: 'Condiciones de salud y responsabilidad personal',
    content: [
      { type: 'paragraph', text: 'La participación en las actividades se realiza bajo la exclusiva responsabilidad del alumno/a.' },
      { type: 'paragraph', text: 'El usuario declara encontrarse en condiciones físicas adecuadas para la práctica de ejercicio físico.' },
      { type: 'paragraph', text: 'Asimismo, el alumno/a se compromete a informar previamente al estudio sobre cualquier circunstancia relevante para su salud, incluyendo, entre otras:' },
      {
        type: 'list',
        items: [
          'lesiones previas',
          'patologías',
          'limitaciones físicas',
          'embarazo',
          'cualquier otra condición médica relevante',
        ],
      },
      { type: 'paragraph', text: 'En caso de embarazo, el alumno/a declara disponer de autorización médica para la práctica de ejercicio físico.' },
      { type: 'paragraph', text: 'OOMA Wellness Club no tiene la consideración de centro médico ni de rehabilitación, por lo que las actividades ofrecidas no sustituyen en ningún caso tratamientos médicos, diagnósticos ni procesos clínicos.' },
      { type: 'paragraph', text: 'El instructor podrá adaptar los ejercicios, limitar o impedir la participación del alumno/a cuando lo considere necesario por motivos de seguridad, tanto individual como colectiva.' },
    ],
  },
  {
    number: '03',
    title: 'Lesiones previas y consentimiento informado',
    content: [
      { type: 'paragraph', text: 'En caso de lesión previa o condición médica relevante, OOMA Wellness Club podrá requerir la firma de un documento adicional de consentimiento informado y exención de responsabilidad como condición previa a la participación en las actividades.' },
      { type: 'paragraph', text: 'La admisión a la actividad quedará sujeta, en todo caso, a la valoración del instructor.' },
    ],
  },
  {
    number: '04',
    title: 'Reservas, cancelaciones y créditos',
    content: [
      { type: 'paragraph', text: 'Las clases podrán cancelarse o reprogramarse sin penalización hasta con 2 horas de antelación respecto a su inicio.' },
      { type: 'paragraph', text: 'Las cancelaciones realizadas entre 1 hora y 1 hora 59 minutos antes del inicio de la actividad conllevarán la pérdida del crédito correspondiente.' },
      { type: 'paragraph', text: 'Las cancelaciones efectuadas con menos de 1 hora de antelación, así como la no asistencia a la sesión reservada, implicarán la pérdida automática del crédito, sin derecho a recuperación ni reembolso.' },
    ],
  },
  {
    number: '05',
    title: 'Puntualidad y acceso a clase',
    content: [
      { type: 'paragraph', text: 'Por motivos organizativos y de seguridad, no se permitirá el acceso a la clase una vez transcurridos 10 minutos desde su inicio.' },
      { type: 'paragraph', text: 'En tal caso, la sesión se considerará consumida a todos los efectos.' },
    ],
  },
  {
    number: '06',
    title: 'Asignación del reformer',
    content: [
      { type: 'paragraph', text: 'La asignación del reformer se realiza de forma automática a través del sistema de reservas.' },
      { type: 'paragraph', text: 'El alumno/a deberá utilizar exclusivamente el reformer asignado.' },
      { type: 'paragraph', text: 'No está permitido modificar dicha asignación sin la autorización expresa del instructor.' },
    ],
  },
  {
    number: '07',
    title: 'Derecho de admisión y limitación de participación',
    content: [
      { type: 'paragraph', text: 'OOMA Wellness Club se reserva el derecho de admisión, así como la facultad de limitar o suspender la participación en actividades cuando exista un riesgo para la seguridad del alumno/a, del resto de participantes o cuando se incumplan las normas del estudio.' },
    ],
  },
  {
    number: '08',
    title: 'Objetos personales',
    content: [
      { type: 'paragraph', text: 'OOMA Wellness Club no se hace responsable de la pérdida, robo, daño o deterioro de objetos personales dentro de sus instalaciones.' },
    ],
  },
  {
    number: '09',
    title: 'Coffee corner y merchandising',
    content: [
      { type: 'paragraph', text: 'Los productos disponibles en el coffee corner y en el espacio de merchandising no están incluidos en el precio de las clases ni en las membresías.' },
      { type: 'paragraph', text: 'Todos los productos deberán abonarse con carácter previo a su consumo o retirada.' },
      { type: 'paragraph', text: 'OOMA Wellness Club se reserva el derecho de reclamar el importe correspondiente en caso de consumo o retirada sin previo pago.' },
    ],
  },
  {
    number: '10',
    title: 'Modificaciones del servicio',
    content: [
      { type: 'paragraph', text: 'OOMA Wellness Club se reserva el derecho de modificar, en cualquier momento y cuando resulte necesario para el correcto funcionamiento del servicio:' },
      {
        type: 'list',
        items: [
          'horarios',
          'instructores',
          'actividades',
          'servicios ofrecidos',
        ],
      },
    ],
  },
  {
    number: '11',
    title: 'Reglamento interno del estudio',
    content: [
      { type: 'paragraph', text: 'El alumno/a se compromete a respetar el Reglamento Interno del Estudio, disponible tanto en la web como en las instalaciones.' },
      { type: 'paragraph', text: 'El incumplimiento del mismo podrá dar lugar a la suspensión temporal o definitiva del acceso al estudio.' },
    ],
  },
  {
    number: '12',
    title: 'Protección de datos personales (RGPD)',
    content: [
      { type: 'paragraph', text: 'De conformidad con el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD), se informa de que los datos personales facilitados serán tratados por OOMA Wellness Club con las siguientes finalidades:' },
      {
        type: 'list',
        items: [
          'gestión de reservas',
          'gestión de pagos',
          'organización de actividades',
          'mantenimiento de la relación contractual',
          'envío de comunicaciones relacionadas con el servicio',
        ],
      },
      { type: 'paragraph', text: 'Los datos no serán cedidos a terceros, salvo obligación legal o cuando resulte necesario para la correcta prestación del servicio.' },
      { type: 'paragraph', text: 'El usuario podrá ejercer sus derechos de acceso, rectificación, supresión, limitación del tratamiento, oposición y portabilidad mediante solicitud dirigida a:' },
      { type: 'link', label: 'admin@oomawellness.shop', href: 'mailto:admin@oomawellness.shop' },
      { type: 'paragraph', text: 'El usuario declara haber sido informado del tratamiento de sus datos personales y acepta su uso en los términos indicados.' },
    ],
  },
  {
    number: '13',
    title: 'Aceptación de los términos y condiciones',
    content: [
      { type: 'paragraph', text: 'El registro en la plataforma web o app implica la lectura, comprensión y aceptación íntegra de los presentes Términos y Condiciones.' },
      { type: 'paragraph', text: 'OOMA Wellness Club se reserva el derecho de modificar el presente documento en cualquier momento, con el fin de adaptarlo a mejoras del servicio o a cambios normativos.' },
    ],
  },
]

const DISCLAIMER_FOOTER = 'OOMA Wellness Club · 47829719T · admin@oomawellness.shop · +34 744 43 2128'

// ─── DisclaimerStep component ────────────────────────────────────────────────

function DisclaimerStep({
  onBack,
  onAccept,
  loading,
  error,
}: {
  onBack: () => void
  onAccept: () => void
  loading: boolean
  error: string
}) {
  const { t } = useTranslation()
  const [scrolledToBottom, setScrolledToBottom] = useState(false)
  const [checked, setChecked] = useState(false)
  const scrollViewHeightRef = useRef<number>(0)

  function handleLayout(e: any) {
    scrollViewHeightRef.current = e.nativeEvent.layout.height
  }

  function handleContentSizeChange(_w: number, contentHeight: number) {
    // If content fits entirely in the visible area, unlock immediately
    if (contentHeight <= scrollViewHeightRef.current) {
      setScrolledToBottom(true)
    }
  }

  function handleScroll(e: any) {
    if (scrolledToBottom) return
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y
    if (distanceFromBottom <= 20) {
      setScrolledToBottom(true)
    }
  }

  const canCheck = scrolledToBottom
  const canAccept = canCheck && checked

  function renderListItem(item: { bold: string; text: string } | string, idx: number) {
    if (typeof item === 'string') {
      return (
        <View key={idx} style={ds.listItem}>
          <Text style={ds.bullet}>•</Text>
          <Text style={ds.listText}>{item}</Text>
        </View>
      )
    }
    return (
      <View key={idx} style={ds.listItem}>
        <Text style={ds.bullet}>•</Text>
        <Text style={ds.listText}>
          <Text style={ds.listBold}>{item.bold}</Text>
          {item.text}
        </Text>
      </View>
    )
  }

  function renderSection(section: DisclaimerSection) {
    return (
      <View key={section.number} style={ds.section}>
        <Text style={ds.sectionNumber}>{section.number}</Text>
        <Text style={ds.sectionTitle}>{section.title}</Text>
        {section.content.map((item, idx) => {
          if (item.type === 'paragraph') {
            return <Text key={idx} style={ds.paragraph}>{item.text}</Text>
          }
          if (item.type === 'subheading') {
            return <Text key={idx} style={ds.subheading}>{item.text}</Text>
          }
          if (item.type === 'list') {
            return (
              <View key={idx} style={ds.list}>
                {item.items.map((li, i) => renderListItem(li, i))}
              </View>
            )
          }
          if (item.type === 'link') {
            return (
              <TouchableOpacity key={idx} onPress={() => Linking.openURL(item.href)}>
                <Text style={ds.link}>{item.label}</Text>
              </TouchableOpacity>
            )
          }
          return null
        })}
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Pinned top notice */}
      <View style={ds.notice}>
        <Text style={ds.noticeText}>
          {t('onboarding.disclaimer.notice')}
        </Text>
      </View>

      {/* Scrollable disclaimer content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={ds.scrollContent}
        showsVerticalScrollIndicator={true}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onLayout={handleLayout}
        onContentSizeChange={handleContentSizeChange}
      >
        {/* Header block */}
        <Text style={ds.docTitle}>{DISCLAIMER_HEADER.title}</Text>

        <View style={ds.divider} />

        {/* Sections */}
        {DISCLAIMER_SECTIONS.map(renderSection)}

        {/* Footer */}
        <View style={ds.divider} />
        <Text style={ds.footer}>{DISCLAIMER_FOOTER}</Text>
      </ScrollView>

      {/* Pinned bottom: checkbox + buttons */}
      <View style={ds.bottomBar}>
        <TouchableOpacity
          style={ds.checkRow}
          onPress={() => canCheck && setChecked(v => !v)}
          activeOpacity={canCheck ? 0.7 : 1}
        >
          <View style={[ds.checkbox, checked && ds.checkboxActive, !canCheck && ds.checkboxDisabled]}>
            {checked && <Text style={ds.checkmark}>✓</Text>}
          </View>
          <Text style={[ds.checkLabel, !canCheck && ds.checkLabelDisabled]}>
            {t('onboarding.disclaimer.checkboxLabel')}
          </Text>
        </TouchableOpacity>

        {error ? <Text style={ds.errorText}>{error}</Text> : null}

        <View style={ds.navRow}>
          <TouchableOpacity style={ds.backBtn} onPress={onBack} disabled={loading}>
            <Text style={ds.backBtnText}>{t('common.back')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[ds.acceptBtn, !canAccept && ds.btnDisabled]}
            onPress={onAccept}
            disabled={!canAccept || loading}
          >
            {loading
              ? <ActivityIndicator size="small" color={C.cream} />
              : <Text style={ds.acceptBtnText}>{t('onboarding.disclaimer.acceptButton')}</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function CompleteProfileScreen() {
  const params = useLocalSearchParams<{ userId: string; email: string }>()
  const userId = params.userId
  const email = params.email ? decodeURIComponent(params.email) : ''
  const { signIn, token, refreshUser } = useAuth()
  const router = useRouter()
  const { t } = useTranslation()

  const steps = [
    t('onboarding.languageStep.title'),
    t('onboarding.steps.password'),
    t('onboarding.steps.about'),
    t('onboarding.steps.contact'),
    t('onboarding.steps.goals'),
    t('onboarding.steps.disclaimer'),
    t('onboarding.steps.more'),
  ]

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showWalletModal, setShowWalletModal] = useState(false)

  // Step 0 — language
  const [language, setLanguageState] = useState<AppLanguage>('es')

  // Step 1 — password
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Step 2 — name + DNI/NIE
  const [name, setName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dni, setDni] = useState('')
  const [dniError, setDniError] = useState('')

  // Step 3 — phone
  const [countryCode, setCountryCode] = useState('+34')
  const [phone, setPhone] = useState('')
  const [countryPickerVisible, setCountryPickerVisible] = useState(false)

  // Step 4 — goals
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([])

  // Step 5 — disclaimer (no local state beyond what DisclaimerStep manages)

  // Step 6 — birthday + conditions
  const [birthMonth, setBirthMonth] = useState('')
  const [birthDay, setBirthDay] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [hasConditions, setHasConditions] = useState<boolean | null>(null)
  const [selectedConditions, setSelectedConditions] = useState<string[]>([])
  const [conditionOther, setConditionOther] = useState('')
  const [monthPickerVisible, setMonthPickerVisible] = useState(false)
  const [dayPickerVisible, setDayPickerVisible] = useState(false)
  const [yearPickerVisible, setYearPickerVisible] = useState(false)

  const scrollRef = useRef<ScrollView>(null)

  function scrollTop() {
    scrollRef.current?.scrollTo({ y: 0, animated: false })
  }

  function handleLanguageSelect(lang: AppLanguage) {
    setLanguageState(lang)
    i18n.changeLanguage(lang)
    setStep(1)
    scrollTop()
  }

  function validate(): string | null {
    if (step === 1) {
      if (!password) return t('onboarding.password.errorEmpty')
      if (password.length < 8) return t('onboarding.password.errorLength')
      if (!/[A-Z]/.test(password)) return t('onboarding.password.errorCapital')
      if (!/[^A-Za-z0-9]/.test(password)) return t('onboarding.password.errorSpecial')
      if (password !== confirmPassword) return t('onboarding.password.errorMatch')
    }
    if (step === 2) {
      if (!name.trim()) return t('onboarding.about.errorFirstName')
      if (!lastName.trim()) return t('onboarding.about.errorLastName')
      if (!dni.trim()) return t('onboarding.about.errorDniEmpty')
      if (!validateDNI(dni)) return t('onboarding.about.errorDniInvalid')
    }
    if (step === 3) {
      if (!phone.trim()) return t('onboarding.contact.errorEmpty')
      const lengths = PHONE_LENGTHS[countryCode]
      if (lengths) {
        const digits = phone.replace(/\D/g, '')
        if (digits.length < lengths.min || digits.length > lengths.max) {
          return lengths.min === lengths.max
            ? t('onboarding.contact.errorLength', { min: lengths.min, code: countryCode })
            : t('onboarding.contact.errorRange', { min: lengths.min, max: lengths.max, code: countryCode })
        }
      }
    }
    if (step === 4) {
      if (selectedGoalIds.length === 0) return t('onboarding.goals.errorEmpty')
    }
    // Step 5 is disclaimer — handled separately via handleDisclaimerAccept
    if (step === 6) {
      if (!birthMonth || !birthDay || !birthYear) return t('onboarding.more.errorBirthday')
      if (hasConditions === null) return t('onboarding.more.errorConditions')
      if (hasConditions && selectedConditions.length === 0) return t('onboarding.more.errorConditionsSelect')
      if (hasConditions && selectedConditions.includes('Other') && !conditionOther.trim()) {
        return t('onboarding.more.errorOther')
      }
    }
    return null
  }

  async function handleNext() {
    const err = validate()
    if (err) { setError(err); return }
    setError('')

    if (step === 2) {
      const normalizedDni = dni.trim().toUpperCase()
      setLoading(true)
      try {
        await api.post('/api/mobile/auth/validate-dni', { dni: normalizedDni, userId })
        // { available: true } — proceed
      } catch (e: any) {
        if (e?.response?.status === 409) {
          setDni('')
          setDniError(t('onboarding.about.errorDniTaken'))
        } else {
          setDniError(t('onboarding.about.errorDniVerify'))
        }
        setLoading(false)
        return
      } finally {
        setLoading(false)
      }
    }

    if (step === 3) {
      const fullPhone = countryCode + phone.replace(/\D/g, '')
      setLoading(true)
      try {
        const { data } = await api.get(
          `/api/user/check-phone?phone=${encodeURIComponent(fullPhone)}&excludeUserId=${userId}`
        )
        if (data.taken) {
          setError(t('onboarding.contact.errorTaken'))
          setLoading(false)
          return
        }
      } catch {
        // Non-critical — let backend catch it at submit
      } finally {
        setLoading(false)
      }
    }

    if (step < steps.length - 1) {
      setStep(s => s + 1)
      scrollTop()
    } else {
      await handleSubmit()
    }
  }

  async function handleDisclaimerAccept() {
    setLoading(true)
    setError('')
    try {
      await api.patch('/api/user/accept-disclaimer', {
        userId,
        disclaimerVersion: 'v1',
      })
      setStep(s => s + 1)
      scrollTop()
    } catch {
      setError('No se pudo guardar tu aceptación. Por favor, inténtalo de nuevo.')
    } finally {
      setLoading(false)
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

    let confirmedEmail = email.trim().toLowerCase()
    try {
      const { data } = await api.patch('/api/user/complete-onboarding', {
        userId,
        password,
        name: name.trim(),
        lastName: lastName.trim(),
        phone: fullPhone,
        dni: dni.trim().toUpperCase(),
        goalIds: selectedGoalIds,
        birthday,
        additionalInfo,
        language,
      })
      if (data?.user?.email) confirmedEmail = data.user.email.trim().toLowerCase()
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.response?.data?.error
      setError(msg ?? 'Could not complete sign-up. Please try again.')
      setLoading(false)
      return
    }

    try {
      if (token) {
        await refreshUser()
      } else {
        await signIn(confirmedEmail, password)
      }
      // Check gift flag before navigating so profile shows modal immediately
      try {
        const { data } = await api.get('/api/mobile/config')
        if (data.earlyMemberGiftEnabled) setPendingGift()
      } catch {}
      router.replace('/(tabs)/profile')
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
        {/* Progress dots */}
        <View style={styles.progressBar}>
          {steps.map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressDot,
                i === step ? styles.progressActive : i < step ? styles.progressDone : styles.progressPending,
              ]}
            />
          ))}
        </View>

        {/* Disclaimer step gets its own full layout */}
        {step === 5 ? (
          <DisclaimerStep
            onBack={handleBack}
            onAccept={handleDisclaimerAccept}
            loading={loading}
            error={error}
          />
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.stepHeading}>{steps[step]}</Text>

            {/* ─── Step 0: Language ─── */}
            {step === 0 && (
              <View style={styles.langCards}>
                {LANGUAGES.map(lang => (
                  <TouchableOpacity
                    key={lang.code}
                    style={styles.langCard}
                    onPress={() => handleLanguageSelect(lang.code)}
                    activeOpacity={0.75}
                  >
                    {lang.flag === 'ca' ? (
                      <Image
                        source={require('@/assets/flag-ca.png')}
                        style={styles.langFlag}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={styles.langFlagEmoji}>{lang.flag}</Text>
                    )}
                    <Text style={styles.langLabel}>{lang.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ─── Step 1: Password ─── */}
            {step === 1 && (
              <View>
                <Text style={styles.fieldLabel}>{t('onboarding.password.passwordLabel')}</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, styles.inputFlex]}
                    value={password}
                    onChangeText={v => { setPassword(v); setError('') }}
                    secureTextEntry={!showPassword}
                    autoComplete="new-password"
                    placeholderTextColor={C.lightGray}
                  />
                  <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(v => !v)}>
                    <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.hint}>{t('onboarding.password.rules')}</Text>

                <Text style={styles.fieldLabel}>{t('onboarding.password.confirmLabel')}</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, styles.inputFlex]}
                    value={confirmPassword}
                    onChangeText={v => { setConfirmPassword(v); setError('') }}
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

            {/* ─── Step 2: Name + DNI/NIE ─── */}
            {step === 2 && (
              <View>
                <Text style={styles.fieldLabel}>{t('onboarding.about.firstNameLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={v => { setName(v); setError('') }}
                  autoCapitalize="words"
                  placeholderTextColor={C.lightGray}
                />
                <Text style={styles.fieldLabel}>{t('onboarding.about.lastNameLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={lastName}
                  onChangeText={v => { setLastName(v); setError('') }}
                  autoCapitalize="words"
                  placeholderTextColor={C.lightGray}
                />
                <Text style={styles.fieldLabel}>{t('onboarding.about.dniLabel')}</Text>
                <TextInput
                  style={[styles.input, dniError ? styles.inputError : null]}
                  value={dni}
                  onChangeText={v => { setDni(v); setDniError(''); setError('') }}
                  placeholder={t('onboarding.about.dniPlaceholder')}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholderTextColor={C.lightGray}
                />
                {dniError ? <Text style={styles.fieldError}>{dniError}</Text> : null}
              </View>
            )}

            {/* ─── Step 3: Phone ─── */}
            {step === 3 && (
              <View>
                <Text style={styles.fieldLabel}>{t('onboarding.contact.phoneLabel')}</Text>
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
                    onChangeText={v => { setPhone(v.replace(/\D/g, '')); setError('') }}
                    keyboardType="phone-pad"
                    placeholderTextColor={C.lightGray}
                  />
                </View>
                {PHONE_LENGTHS[countryCode] && (
                  <Text style={styles.hint}>
                    {PHONE_LENGTHS[countryCode].min === PHONE_LENGTHS[countryCode].max
                      ? t('onboarding.contact.digitHintExact', { min: PHONE_LENGTHS[countryCode].min })
                      : t('onboarding.contact.digitHintRange', { min: PHONE_LENGTHS[countryCode].min, max: PHONE_LENGTHS[countryCode].max })}
                  </Text>
                )}
              </View>
            )}

            {/* ─── Step 4: Goals ─── */}
            {step === 4 && (
              <View>
                <Text style={styles.fieldLabel}>{t('onboarding.goals.accomplishLabel')}</Text>
                <GoalSelector
                  selectedIds={selectedGoalIds}
                  onChange={ids => { setSelectedGoalIds(ids); setError('') }}
                />
              </View>
            )}

            {/* ─── Step 6: Birthday + Conditions ─── */}
            {step === 6 && (() => {
              const tMonths = t('onboarding.more.months', { returnObjects: true }) as string[]
              const monthLabel = birthMonth ? tMonths[MONTHS.indexOf(birthMonth)] : t('onboarding.more.monthPlaceholder')
              return (
              <View>
                <Text style={styles.fieldLabel}>{t('onboarding.more.birthdayLabel')}</Text>
                <View style={styles.birthdayRow}>
                  <TouchableOpacity style={styles.dateBtn} onPress={() => setMonthPickerVisible(true)}>
                    <Text style={[styles.dateBtnText, !birthMonth && styles.datePlaceholder]}>
                      {monthLabel}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dateBtn} onPress={() => setDayPickerVisible(true)}>
                    <Text style={[styles.dateBtnText, !birthDay && styles.datePlaceholder]}>
                      {birthDay || t('onboarding.more.dayPlaceholder')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dateBtn} onPress={() => setYearPickerVisible(true)}>
                    <Text style={[styles.dateBtnText, !birthYear && styles.datePlaceholder]}>
                      {birthYear || t('onboarding.more.yearPlaceholder')}
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.fieldLabel}>{t('onboarding.more.conditionsQuestion')}</Text>
                <View style={styles.yesNoRow}>
                  <TouchableOpacity
                    style={[styles.yesNoBtn, hasConditions === false && styles.yesNoBtnActive]}
                    onPress={() => { setHasConditions(false); setSelectedConditions([]) }}
                  >
                    <Text style={[styles.yesNoText, hasConditions === false && styles.yesNoTextActive]}>{t('onboarding.more.conditionsNo')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.yesNoBtn, hasConditions === true && styles.yesNoBtnActive]}
                    onPress={() => setHasConditions(true)}
                  >
                    <Text style={[styles.yesNoText, hasConditions === true && styles.yesNoTextActive]}>{t('onboarding.more.conditionsYes')}</Text>
                  </TouchableOpacity>
                </View>

                {hasConditions === true && (
                  <View style={styles.conditionsGrid}>
                    <Text style={styles.selectAllLabel}>{t('onboarding.more.selectAll')}</Text>
                    <View style={styles.conditionsRow}>
                      {CONDITIONS.map(c => (
                        <TouchableOpacity
                          key={c}
                          style={[styles.conditionChip, selectedConditions.includes(c) && styles.conditionChipActive]}
                          onPress={() => toggleCondition(c)}
                        >
                          <Text style={[styles.conditionText, selectedConditions.includes(c) && styles.conditionTextActive]}>
                            {selectedConditions.includes(c) ? '☑ ' : '☐ '}{t(`onboarding.more.conditions.${c}` as any)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={[styles.conditionChipWide, selectedConditions.includes('Other') && styles.conditionChipActive]}
                        onPress={() => toggleCondition('Other')}
                      >
                        <Text style={[styles.conditionText, selectedConditions.includes('Other') && styles.conditionTextActive]}>
                          {selectedConditions.includes('Other') ? '☑ ' : '☐ '}{t('onboarding.more.otherSpecify')}
                        </Text>
                      </TouchableOpacity>
                      {selectedConditions.includes('Other') && (
                        <TextInput
                          style={styles.otherInput}
                          value={conditionOther}
                          onChangeText={setConditionOther}
                          placeholder={t('onboarding.more.otherPlaceholder')}
                          placeholderTextColor={C.lightGray}
                        />
                      )}
                    </View>
                  </View>
                )}
              </View>
            )})()}

            {step > 0 && error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* Navigation buttons — hidden on step 0 (language cards act as the action) */}
            {step > 0 && (
              <View style={styles.navRow}>
                {step > 1 && (
                  <TouchableOpacity style={styles.backBtn} onPress={handleBack} disabled={loading}>
                    <Text style={styles.backBtnText}>{t('common.back')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.nextBtn, step === 1 && styles.nextBtnFull, loading && styles.btnDisabled]}
                  onPress={handleNext}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator color={C.cream} />
                    : <Text style={styles.nextBtnText}>
                        {step === steps.length - 1 ? t('onboarding.submit.letsGo') : t('common.continue')}
                      </Text>
                  }
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* Pickers */}
      <PickerModal
        visible={countryPickerVisible}
        onClose={() => setCountryPickerVisible(false)}
        title={t('onboarding.picker.country')}
        items={COUNTRY_CODES.map(c => ({ key: c.code, label: `${c.flag} ${c.label}` }))}
        onSelect={key => { setCountryCode(key); setPhone('') }}
      />
      <PickerModal
        visible={monthPickerVisible}
        onClose={() => setMonthPickerVisible(false)}
        title={t('onboarding.picker.month')}
        items={MONTHS.map((m, i) => ({ key: m, label: (t('onboarding.more.months', { returnObjects: true }) as string[])[i] }))}
        onSelect={key => setBirthMonth(key)}
      />
      <PickerModal
        visible={dayPickerVisible}
        onClose={() => setDayPickerVisible(false)}
        title={t('onboarding.picker.day')}
        items={days.map(d => ({ key: d, label: d }))}
        onSelect={key => setBirthDay(key)}
      />
      <PickerModal
        visible={yearPickerVisible}
        onClose={() => setYearPickerVisible(false)}
        title={t('onboarding.picker.year')}
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

// ─── Main screen styles ──────────────────────────────────────────────────────
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
  // Language step
  langCards: {
    gap: 16,
    marginTop: 8,
  },
  langCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.rule,
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  langFlagEmoji: {
    fontSize: 32,
  },
  langFlag: {
    width: 48,
    height: 32,
    borderRadius: 4,
  },
  langLabel: {
    fontFamily: F.sansMed,
    fontSize: 18,
    color: C.ink,
    letterSpacing: 0.3,
  },
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
  inputError: {
    borderColor: C.red,
  },
  fieldError: {
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.red,
    marginTop: -12,
    marginBottom: 12,
  },
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
    marginTop: 6,
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

// ─── Disclaimer step styles ──────────────────────────────────────────────────
const ds = StyleSheet.create({
  notice: {
    backgroundColor: C.bone,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  noticeText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.ink,
    lineHeight: 17,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: 8,
  },
  docTitle: {
    fontFamily: F.serifBold,
    fontSize: 18,
    color: C.ink,
    marginBottom: 6,
    lineHeight: 24,
  },
  docMeta: {
    fontFamily: F.sansReg,
    fontSize: 10,
    color: C.midGray,
    marginBottom: 3,
    letterSpacing: 0.3,
  },
  importantNotice: {
    backgroundColor: C.burgPale,
    borderLeftWidth: 3,
    borderLeftColor: C.burg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 2,
  },
  importantText: {
    fontFamily: F.sansReg,
    fontSize: 11,
    color: C.burg,
    lineHeight: 17,
  },
  divider: {
    height: 1,
    backgroundColor: C.rule,
    marginVertical: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionNumber: {
    fontFamily: F.sansMed,
    fontSize: 10,
    color: C.midGray,
    letterSpacing: 2,
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: F.serifBold,
    fontSize: 16,
    color: C.ink,
    marginBottom: 10,
    lineHeight: 22,
  },
  subheading: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.ink,
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  paragraph: {
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.ink,
    lineHeight: 20,
    marginBottom: 10,
  },
  list: {
    marginBottom: 10,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingLeft: 4,
  },
  bullet: {
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.midGray,
    marginRight: 8,
    marginTop: 3,
    lineHeight: 18,
  },
  listText: {
    flex: 1,
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.ink,
    lineHeight: 20,
  },
  listBold: {
    fontFamily: F.sansMed,
    fontSize: 12,
    color: C.ink,
  },
  link: {
    fontFamily: F.sansMed,
    fontSize: 12,
    color: C.burg,
    textDecorationLine: 'underline',
    marginBottom: 10,
  },
  footer: {
    fontFamily: F.sansReg,
    fontSize: 10,
    color: C.midGray,
    textAlign: 'center',
    letterSpacing: 0.3,
    paddingBottom: 8,
  },
  bottomBar: {
    backgroundColor: C.cream,
    borderTopWidth: 1,
    borderTopColor: C.rule,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 8 : 16,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 14,
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
  checkboxDisabled: { backgroundColor: C.bone, borderColor: C.rule },
  checkmark: { color: C.cream, fontSize: 13, fontWeight: '700' },
  checkLabel: {
    flex: 1,
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.ink,
    lineHeight: 19,
  },
  checkLabelDisabled: { color: C.lightGray },
  errorText: {
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.red,
    marginBottom: 10,
    textAlign: 'center',
  },
  navRow: {
    flexDirection: 'row',
    gap: 12,
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
  acceptBtn: {
    flex: 2,
    height: 50,
    backgroundColor: C.burg,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: {
    fontFamily: F.sansMed,
    fontSize: 11,
    color: C.cream,
    letterSpacing: 2,
  },
  btnDisabled: { opacity: 0.4 },
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
