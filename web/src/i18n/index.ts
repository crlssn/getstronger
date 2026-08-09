import { createI18n } from 'vue-i18n'
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

export const i18n = createI18n({
  legacy: false,
  locale: appLocale,
  fallbackLocale: 'en',
  messages: { en, sv },
})
