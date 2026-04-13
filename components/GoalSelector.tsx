import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { C, F } from '@/constants/theme'

type Goal = { id: string; label: string }

type Props = {
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export default function GoalSelector({ selectedIds, onChange }: Props) {
  const { t } = useTranslation()
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/mobile/goals')
      .then(({ data }) => setGoals(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(s => s !== id))
    } else {
      if (selectedIds.length >= 3) return
      onChange([...selectedIds, id])
    }
  }

  if (loading) return <ActivityIndicator color={C.burg} style={{ marginVertical: 16 }} />

  return (
    <View>
      <View style={s.pillsRow}>
        {goals.map(goal => {
          const selected = selectedIds.includes(goal.id)
          const disabled = !selected && selectedIds.length >= 3
          return (
            <TouchableOpacity
              key={goal.id}
              style={[s.pill, selected && s.pillSelected, disabled && s.pillDisabled]}
              onPress={() => toggle(goal.id)}
              disabled={disabled}
              activeOpacity={0.7}
            >
              <Text style={[s.pillText, selected && s.pillTextSelected, disabled && s.pillTextDisabled]}>
                {t(`onboarding.goals.labels.${goal.label}` as any, { defaultValue: goal.label })}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
      <Text style={s.counter}>
        {t('onboarding.goals.counter', { count: selectedIds.length })}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  pill: {
    borderWidth: 1,
    borderColor: C.ink,
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pillSelected: {
    backgroundColor: C.burg,
    borderColor: C.burg,
  },
  pillDisabled: {
    borderColor: C.lightGray,
  },
  pillText: {
    fontFamily: F.sansReg,
    fontSize: 13,
    color: C.ink,
  },
  pillTextSelected: {
    color: '#fff',
    fontFamily: F.sansMed,
  },
  pillTextDisabled: {
    color: C.lightGray,
  },
  counter: {
    fontFamily: F.sansReg,
    fontSize: 12,
    color: C.midGray,
    marginTop: 4,
  },
})
