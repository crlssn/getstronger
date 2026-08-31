import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { applyLocale, deviceLocale, type AppLocale } from '@/i18n'
import { migratedStorage } from '@/stores/persistence'

interface LocaleState {
  /** The chosen language, or undefined while the device decides. */
  locale?: AppLocale
  setLocale: (locale?: AppLocale) => void
}

/** The language the app reads in: the chosen one, or whatever the device asks for. */
export const selectLocale = (state: LocaleState): AppLocale => state.locale ?? deviceLocale

/**
 * The language, kept on the device rather than on the account.
 *
 * There is no field for it on the server, and a phone and a laptop signed in
 * to the same account are two readers as often as they are one. Being local
 * also means it is the one setting that still changes with no connection.
 */
export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: undefined,

      setLocale: (locale) => {
        set({ locale })
        applyLocale(locale ?? deviceLocale)
      },
    }),
    {
      name: 'locale',
      storage: migratedStorage(),
      partialize: ({ locale }) => ({ locale }),
    },
  ),
)

/**
 * Puts the app into the stored language.
 *
 * Called by the app at startup rather than on import: i18next is initialised
 * with the device's locale, and this is what a previous choice overrides it
 * with, before the first render.
 */
export const startLocale = (): void => applyLocale(selectLocale(useLocaleStore.getState()))
