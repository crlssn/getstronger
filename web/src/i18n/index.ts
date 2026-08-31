import i18next, { type i18n as I18nInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en, sv } from './messages'

export type AppLocale = 'en' | 'sv'

/**
 * The locale to open in: the first language the browser asks for that the app
 * speaks.
 *
 * Order is the whole of the preference — a browser that lists English before
 * Swedish is asking for English, and picking Swedish out of the middle of the
 * list would override a choice the reader has already made. Anything unspoken
 * is skipped, and a list with nothing in common falls back to English.
 */
export const resolveLocale = (languages: readonly string[] = []): AppLocale => {
  const spoken: AppLocale[] = ['en', 'sv']
  const preferred = languages
    .map((language) => language.toLowerCase().split('-')[0])
    .find((language): language is AppLocale => spoken.some((locale) => locale === language))

  return preferred ?? 'en'
}

const browserLanguages =
  typeof navigator === 'undefined'
    ? []
    : navigator.languages?.length
      ? navigator.languages
      : [navigator.language]

/**
 * Every language the app speaks, in its own name.
 *
 * Endonyms rather than catalogue keys: a reader looking for their language in
 * a list they cannot read finds 'Svenska', not 'Swedish' translated into a
 * third language. Same reason the brand name is not in the catalogue.
 */
export const localeNames: Record<AppLocale, string> = {
  en: 'English',
  sv: 'Svenska',
}

/** The locale this device asks for, and what an account that has not chosen gets. */
export const deviceLocale = resolveLocale(browserLanguages)

/** The locale the app is reading in right now. */
export const currentLocale = (): AppLocale => resolveLocale([i18n.language])

/**
 * The locale dates and numbers are formatted in.
 *
 * A function rather than a constant: the language is chosen in the settings
 * and changes without a reload, and a constant read at import time would keep
 * formatting every date in whatever the device asked for.
 */
export const dateLocale = (): string => (currentLocale() === 'sv' ? 'sv-SE' : 'en-GB')

/**
 * Switches the app to a locale, and tells the page it did.
 *
 * `documentElement.lang` is what a screen reader picks its voice from, so it
 * moves with the catalogue rather than being set once at startup.
 */
export const applyLocale = (locale: AppLocale): void => {
  void i18n.changeLanguage(locale)
  if (typeof document !== 'undefined') document.documentElement.lang = locale
}

export const i18n: I18nInstance = i18next.createInstance()

void i18n.use(initReactI18next).init({
  lng: deviceLocale,
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
