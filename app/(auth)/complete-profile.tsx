import { useState, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, FlatList, ScrollView,
  KeyboardAvoidingView, Platform, Alert, Linking,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import { C, F } from '@/constants/theme'
import { COUNTRY_CODES, PHONE_LENGTHS, CONDITIONS, MONTHS } from '@/constants/onboarding'
import WalletModal from '@/components/WalletModal'
import { setPendingGift } from '@/lib/pendingGift'

const STEPS = [
  'Create your password',
  'Tell us about yourself',
  'How can we reach you?',
  "What's your goal",
  'Aviso de Salud y Responsabilidad',
  'A little more about you',
]

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
  title: 'AVISO DE SALUD Y RESPONSABILIDAD — OOMA WELLNESS CLUB',
  meta: 'Versión 1.0 · 2026 · Barcelona, Catalunya, España',
  legal: 'Marco legal: RDL 1/2007 · Decret legislatiu 1/2000 · Última actualización: Marzo 2026',
  notice: 'Aviso importante: La aceptación de este documento es condición necesaria para participar en cualquier actividad de OOMA Wellness Club. Si tienes dudas sobre tu estado de salud, te recomendamos consultar con un profesional médico antes de comenzar.',
}

const DISCLAIMER_SECTIONS: DisclaimerSection[] = [
  {
    number: '01',
    title: 'OBJETO Y ÁMBITO DE APLICACIÓN',
    content: [
      { type: 'paragraph', text: 'El presente Aviso de Salud y Responsabilidad (en adelante, «el Aviso») es emitido por OOMA Wellness Club (en adelante, «OOMA»), con domicilio en Barcelona, Catalunya, y es de aplicación obligatoria a todas las personas que accedan, participen o hagan uso de cualquiera de sus servicios, instalaciones, clases o actividades, ya sea de forma presencial o a través de su plataforma digital.' },
      { type: 'paragraph', text: 'Las actividades ofrecidas por OOMA incluyen, sin carácter exhaustivo: Pilates Reformer (método STOTT), Yoga (en sus modalidades Vinyasa, Yin y Restaurativo) y Power Flow (combinación de HIIT y Reformer). Todas ellas son disciplinas de actividad física que implican esfuerzo corporal y, como tales, conllevan riesgos inherentes que el usuario acepta de forma consciente e informada al participar.' },
      { type: 'paragraph', text: 'Este Aviso se rige por el Real Decreto Legislativo 1/2007 (Ley General para la Defensa de los Consumidores y Usuarios), el Decret legislatiu 1/2000 de la Llei de l\'Esport de Catalunya, y el Codi Civil de Catalunya.' },
    ],
  },
  {
    number: '02',
    title: 'APTITUD FÍSICA Y ESTADO DE SALUD',
    content: [
      { type: 'paragraph', text: 'La práctica de actividad física organizada requiere que el usuario se encuentre en condiciones físicas adecuadas. Al participar en OOMA, el usuario declara que:' },
      {
        type: 'list',
        items: [
          'Se encuentra en buen estado de salud general y no tiene conocimiento de ninguna condición médica que contraindique la práctica de actividad física moderada o intensa.',
          'No ha sido aconsejado por un profesional médico para abstenerse de realizar ejercicio físico o actividad similar a la ofrecida por OOMA.',
          'En caso de padecer alguna condición médica conocida (cardiovascular, músculo-esquelética, metabólica, respiratoria u otra), lo comunicará al instructor antes del inicio de la clase.',
          'Tiene 18 años cumplidos o, en su defecto, cuenta con la autorización expresa de su tutor legal.',
          'Se compromete a informar a OOMA de cualquier cambio en su estado de salud que pueda afectar a su capacidad de práctica.',
          'Practica las actividades de forma voluntaria, con plena conciencia del esfuerzo físico que implican.',
        ],
      },
      { type: 'paragraph', text: 'OOMA recomienda encarecidamente que toda persona que se incorpore por primera vez realice una revisión médica previa, especialmente si no realiza ejercicio físico de forma regular, si ha superado los 40 años, o si tiene antecedentes cardiovasculares o lesiones previas.' },
    ],
  },
  {
    number: '03',
    title: 'RIESGOS INHERENTES A LA ACTIVIDAD',
    content: [
      { type: 'paragraph', text: 'La práctica de actividad física organizada, incluso bajo supervisión profesional, conlleva riesgos inherentes. El usuario reconoce haber sido informado de los siguientes:' },
      {
        type: 'list',
        items: [
          { bold: 'Músculo-esquelético:', text: ' Contracturas, distensiones, esguinces, desgarros musculares y molestias articulares derivadas del esfuerzo físico o de la ejecución incorrecta de los movimientos.' },
          { bold: 'Cardiovascular:', text: ' Elevación de la frecuencia cardíaca y la presión arterial durante sesiones de alta intensidad, con riesgos asociados en personas con condiciones cardiovasculares preexistentes.' },
          { bold: 'Fatiga y mareo:', text: ' Sensación de fatiga extrema, mareo o pérdida de equilibrio asociados a sesiones intensas, deshidratación o hiperventilación durante la práctica.' },
          { bold: 'Uso de equipamiento:', text: ' Riesgos derivados del uso del Reformer y demás equipamiento de Pilates, incluyendo pellizcos, atrapamientos o caídas si el equipo no se utiliza según las instrucciones recibidas.' },
          { bold: 'Posturas avanzadas:', text: ' En yoga y power flow, la ejecución de posturas o secuencias de dificultad media-alta puede provocar sobrecarga articular o muscular, especialmente en practicantes con poca experiencia.' },
          { bold: 'Condición preexistente:', text: ' La práctica sin comunicar una condición médica preexistente puede agravar patologías como hernias discales, lesiones de rodilla, hombro u otras limitaciones físicas diagnosticadas.' },
        ],
      },
    ],
  },
  {
    number: '04',
    title: 'OBLIGACIONES DE OOMA',
    content: [
      { type: 'paragraph', text: 'OOMA asume las siguientes obligaciones con carácter irrenunciable:' },
      {
        type: 'list',
        items: [
          { bold: 'Supervisión profesional certificada:', text: ' todas las clases serán impartidas por instructores con la titulación habilitante correspondiente conforme a la Llei 3/2008.' },
          { bold: 'Instalaciones en condiciones óptimas:', text: ' el Reformer y el resto del equipamiento serán revisados periódicamente.' },
          { bold: 'Seguro de responsabilidad civil:', text: ' OOMA dispone de póliza conforme al artículo 62.3 del Decret legislatiu 1/2000.' },
          { bold: 'Ratio instructor-alumno adecuado:', text: ' OOMA mantendrá una relación que permita supervisión efectiva en todo momento.' },
          { bold: 'Información previa a la práctica:', text: ' los instructores ofrecerán indicaciones de seguridad al inicio de cada sesión.' },
          { bold: 'Actuación diligente ante incidencias:', text: ' ante cualquier accidente o lesión, OOMA activará los protocolos de primeros auxilios y documentará el incidente.' },
          { bold: 'Protocolo de incorporación:', text: ' los nuevos miembros recibirán una sesión introductoria sobre el uso correcto del equipamiento.' },
        ],
      },
    ],
  },
  {
    number: '05',
    title: 'ALCANCE Y LIMITACIÓN DE RESPONSABILIDAD',
    content: [
      { type: 'paragraph', text: 'Conforme al artículo 86 del RDL 1/2007, la exoneración total de responsabilidad de OOMA no es jurídicamente posible. Este documento no pretende eximir a OOMA de responsabilidad en casos de negligencia, sino informar al usuario de los riesgos inherentes y delimitar la responsabilidad de cada parte.' },
      { type: 'subheading', text: 'OOMA sí responde de:' },
      {
        type: 'list',
        items: [
          'Lesiones causadas por mal estado del equipamiento o las instalaciones',
          'Daños derivados de instrucciones incorrectas o negligentes del instructor',
          'Accidentes ocurridos por ausencia o inadecuación de medidas de seguridad',
          'Cualquier daño derivado directamente de una acción u omisión de OOMA o su personal',
        ],
      },
      { type: 'subheading', text: 'OOMA no responde de:' },
      {
        type: 'list',
        items: [
          'Lesiones derivadas exclusivamente del riesgo inherente a la actividad física, debidamente informado',
          'Daños producidos por incumplimiento de las indicaciones del instructor',
          'Lesiones agravadas por la ocultación de una condición médica preexistente',
          'Daños producidos por el uso inadecuado de instalaciones fuera del horario de supervisión',
          'Pérdida o sustracción de objetos personales no depositados en taquilla bajo custodia de pago',
        ],
      },
    ],
  },
  {
    number: '06',
    title: 'OBLIGACIONES DEL USUARIO',
    content: [
      { type: 'paragraph', text: 'El usuario se compromete a observar las siguientes conductas en todo momento:' },
      {
        type: 'list',
        items: [
          { bold: 'Comunicar condiciones médicas:', text: ' informar al instructor de cualquier lesión activa, condición médica, embarazo, operación reciente u otra circunstancia relevante.' },
          { bold: 'Seguir las indicaciones del instructor:', text: ' respetar las correcciones técnicas, las alternativas propuestas y las indicaciones de seguridad.' },
          { bold: 'Respetar sus propios límites:', text: ' cesar en la actividad si experimenta dolor agudo, mareo, dificultad para respirar u otro síntoma de alarma.' },
          { bold: 'Uso correcto del equipamiento:', text: ' manipular el Reformer y el resto del material siguiendo las instrucciones recibidas.' },
          { bold: 'Hidratación y recuperación:', text: ' acudir a las sesiones en condiciones físicas adecuadas.' },
          { bold: 'Respeto del entorno:', text: ' mantener el orden, la higiene y el respeto hacia los demás practicantes e instructores.' },
        ],
      },
    ],
  },
  {
    number: '07',
    title: 'MENORES DE EDAD Y COLECTIVOS CON NECESIDADES ESPECIALES',
    content: [
      { type: 'paragraph', text: 'Las actividades de OOMA están dirigidas a personas mayores de 18 años. En el caso excepcional de que se admita a menores de edad, será requisito indispensable la firma del presente Aviso por parte del tutor legal.' },
      { type: 'paragraph', text: 'OOMA también trabaja con colectivos con condiciones especiales — personas en rehabilitación, embarazadas, mayores de 65 años u otras situaciones — bajo protocolo de adaptación específico. En estos casos, se requerirá informe médico que autorice la práctica.' },
    ],
  },
  {
    number: '08',
    title: 'DATOS DE SALUD Y PROTECCIÓN DE DATOS',
    content: [
      { type: 'paragraph', text: 'Los datos de salud que el usuario comunique a OOMA son considerados datos especialmente protegidos conforme al Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018.' },
      { type: 'paragraph', text: 'Estos datos serán tratados exclusivamente con la finalidad de garantizar la seguridad del usuario durante la práctica, no serán cedidos a terceros sin consentimiento expreso y serán conservados únicamente durante la vigencia de la relación contractual. El usuario puede ejercer sus derechos de acceso, rectificación, supresión y portabilidad enviando un correo a ' },
      { type: 'link', label: 'privacidad@ooma.club', href: 'mailto:privacidad@ooma.club' },
    ],
  },
  {
    number: '09',
    title: 'RESOLUCIÓN DE CONTROVERSIAS Y LEY APLICABLE',
    content: [
      { type: 'paragraph', text: 'Cualquier controversia derivada de la aplicación de este Aviso se someterá a los mecanismos de mediación y resolución extrajudicial de conflictos de consumo disponibles en Catalunya, incluyendo la Junta Arbitral de Consum de Catalunya y la OMIC del Ayuntamiento de Barcelona.' },
      { type: 'paragraph', text: 'Este Aviso se rige por el derecho español y catalán, con sumisión expresa a los Juzgados y Tribunales de la ciudad de Barcelona.' },
      { type: 'paragraph', text: 'Este documento no sustituye ni modifica las condiciones generales de contratación de OOMA Wellness Club. En caso de contradicción entre ambos documentos, prevalecerá la interpretación más favorable al usuario, conforme al artículo 80 del RDL 1/2007.' },
      { type: 'paragraph', text: 'Para cualquier consulta: ' },
      { type: 'link', label: 'legal@ooma.club', href: 'mailto:legal@ooma.club' },
    ],
  },
]

const DISCLAIMER_FOOTER = 'OOMA Wellness Club · Barcelona, Catalunya · Aviso de Salud y Responsabilidad · v1.0 · 2026'

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
          Por favor, lee el aviso completo antes de continuar. Es obligatorio para crear tu cuenta.
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
        <Text style={ds.docMeta}>{DISCLAIMER_HEADER.meta}</Text>
        <Text style={ds.docMeta}>{DISCLAIMER_HEADER.legal}</Text>
        <View style={ds.importantNotice}>
          <Text style={ds.importantText}>{DISCLAIMER_HEADER.notice}</Text>
        </View>

        <View style={ds.divider} />

        {/* 9 sections */}
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
            He leído y acepto el Aviso de Salud y Responsabilidad
          </Text>
        </TouchableOpacity>

        {error ? <Text style={ds.errorText}>{error}</Text> : null}

        <View style={ds.navRow}>
          <TouchableOpacity style={ds.backBtn} onPress={onBack} disabled={loading}>
            <Text style={ds.backBtnText}>BACK</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[ds.acceptBtn, !canAccept && ds.btnDisabled]}
            onPress={onAccept}
            disabled={!canAccept || loading}
          >
            {loading
              ? <ActivityIndicator size="small" color={C.cream} />
              : <Text style={ds.acceptBtnText}>ACEPTO Y CONTINUAR</Text>
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

  // Step 4 — disclaimer (no local state beyond what DisclaimerStep manages)

  // Step 5 — birthday + conditions
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
    // Step 4 is disclaimer — handled separately via handleDisclaimerAccept
    if (step === 5) {
      if (!birthMonth || !birthDay || !birthYear) return 'Please enter your birthday.'
      if (hasConditions === null) return 'Please answer the health conditions question.'
      if (hasConditions && selectedConditions.length === 0) return 'Please select at least one condition.'
      if (hasConditions && selectedConditions.includes('Other') && !conditionOther.trim()) {
        return 'Please describe your other condition.'
      }
    }
    return null
  }

  async function handleNext() {
    const err = validate()
    if (err) { setError(err); return }
    setError('')

    if (step === 2) {
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
        goals: goals.trim(),
        birthday,
        additionalInfo,
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

        {/* Disclaimer step gets its own full layout */}
        {step === 4 ? (
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

            {/* ─── Step 5: Birthday + Conditions ─── */}
            {step === 5 && (
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
        )}
      </KeyboardAvoidingView>

      {/* Pickers */}
      <PickerModal
        visible={countryPickerVisible}
        onClose={() => setCountryPickerVisible(false)}
        title="Select country code"
        items={COUNTRY_CODES.map(c => ({ key: c.code, label: `${c.flag} ${c.label}` }))}
        onSelect={key => { setCountryCode(key); setPhone('') }}
      />
      <PickerModal
        visible={monthPickerVisible}
        onClose={() => setMonthPickerVisible(false)}
        title="Select month"
        items={MONTHS.map(m => ({ key: m, label: m }))}
        onSelect={key => setBirthMonth(key)}
      />
      <PickerModal
        visible={dayPickerVisible}
        onClose={() => setDayPickerVisible(false)}
        title="Select day"
        items={days.map(d => ({ key: d, label: d }))}
        onSelect={key => setBirthDay(key)}
      />
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
