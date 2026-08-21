import i18next, { type i18n as I18nInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en, sv } from './messages'

export type AppLocale = 'en' | 'sv'

export const resolveLocale = (languages: readonly string[] = []): AppLocale => {
  const supported = languages.find((language) => language.toLowerCase().split('-')[0] === 'sv')
  return supported ? 'sv' : 'en'
}

const browserLanguages =
  typeof navigator === 'undefined'
    ? []
    : navigator.languages?.length
      ? navigator.languages
      : [navigator.language]

export const appLocale = resolveLocale(browserLanguages)
export const dateLocale = appLocale === 'sv' ? 'sv-SE' : 'en-GB'

export const i18n: I18nInstance = i18next.createInstance()

void i18n.use(initReactI18next).init({
  lng: appLocale,
  fallbackLng: 'en',
  resources: {
    en: { translation: en },
    sv: { translation: sv },
  },
  interpolation: {
    // The catalogue is written with single braces ('{count} sets'). React
    // escapes on render, so i18next escaping again would double-encode.
    prefix: '{',
    suffix: '}',
    escapeValue: false,
  },
})
