export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const CONDITIONS = ['Pregnancy', 'Post-Surgery', 'Hernia', 'Chronic Condition'] as const

export const COUNTRY_CODES = [
  { code: '+353', flag: '🇮🇪', label: '+353 (Ireland)' },
  { code: '+1',   flag: '🇺🇸', label: '+1 (US/Canada)' },
  { code: '+44',  flag: '🇬🇧', label: '+44 (UK)' },
  { code: '+52',  flag: '🇲🇽', label: '+52 (Mexico)' },
  { code: '+54',  flag: '🇦🇷', label: '+54 (Argentina)' },
  { code: '+55',  flag: '🇧🇷', label: '+55 (Brazil)' },
  { code: '+56',  flag: '🇨🇱', label: '+56 (Chile)' },
  { code: '+57',  flag: '🇨🇴', label: '+57 (Colombia)' },
  { code: '+51',  flag: '🇵🇪', label: '+51 (Peru)' },
  { code: '+58',  flag: '🇻🇪', label: '+58 (Venezuela)' },
  { code: '+34',  flag: '🇪🇸', label: '+34 (Spain)' },
  { code: '+33',  flag: '🇫🇷', label: '+33 (France)' },
  { code: '+49',  flag: '🇩🇪', label: '+49 (Germany)' },
  { code: '+39',  flag: '🇮🇹', label: '+39 (Italy)' },
  { code: '+61',  flag: '🇦🇺', label: '+61 (Australia)' },
  { code: '+91',  flag: '🇮🇳', label: '+91 (India)' },
]

export const PHONE_LENGTHS: Record<string, { min: number; max: number }> = {
  '+353': { min: 7, max: 9 },
  '+1':   { min: 10, max: 10 },
  '+44':  { min: 10, max: 10 },
  '+52':  { min: 10, max: 10 },
  '+54':  { min: 10, max: 10 },
  '+55':  { min: 10, max: 11 },
  '+56':  { min: 9,  max: 9  },
  '+57':  { min: 10, max: 10 },
  '+51':  { min: 9,  max: 9  },
  '+58':  { min: 10, max: 10 },
  '+34':  { min: 9,  max: 9  },
  '+33':  { min: 9,  max: 9  },
  '+49':  { min: 10, max: 12 },
  '+39':  { min: 9,  max: 10 },
  '+61':  { min: 9,  max: 9  },
  '+91':  { min: 10, max: 10 },
}
