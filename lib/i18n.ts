import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from '@/locales/en.json'
import es from '@/locales/es.json'
import ca from '@/locales/ca.json'

export type AppLanguage = 'en' | 'es' | 'ca'

export const LANGUAGES: { code: AppLanguage; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'ca', label: 'Català', flag: 'ca' }, // 'ca' signals to use the image asset
]

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      ca: { translation: ca },
    },
    lng: 'es',           // Default to Spanish before any selection is made
    fallbackLng: 'es',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    compatibilityJSON: 'v3',
  })

export default i18n
