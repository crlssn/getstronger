import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { applyLocale, deviceLocale, type AppLocale } from '@/i18n'
import { migratedStorage } from '@/stores/persistence'
import { applyTheme, deviceTheme, type AppTheme } from '@/theme'

interface LocaleState {
  /** The chosen language, or undefined while the device decides. */
  locale?: AppLocale
  /** The chosen palette, or undefined while the device decides. */
  theme?: AppTheme
  /** What the device asks for, tracked live so System moves with it. */
  deviceTheme: AppTheme
  setLocale: (locale?: AppLocale) => void
  setTheme: (theme?: AppTheme) => void
}

/** The language the app reads in: the chosen one, or whatever the device asks for. */
export const selectLocale = (state: LocaleState): AppLocale => state.locale ?? deviceLocale

/** The palette the app is drawn in: the chosen one, or whatever the device asks for. */
export const selectTheme = (state: LocaleState): AppTheme => state.theme ?? state.deviceTheme

/**
 * The language and the palette, kept on the device rather than on the account.
 *
 * There is no field for either on the server, and a phone and a laptop signed
 * in to the same account are two readers as often as they are one. Being local
 * also means they are the settings that still change with no connection.
 */
export const useLocaleStore = create<LocaleState>()(
  persist(
    (set, get) => ({
      locale: undefined,
      theme: undefined,
      deviceTheme: deviceTheme(),

      setLocale: (locale) => {
        set({ locale })
        applyLocale(locale ?? deviceLocale)
      },

      setTheme: (theme) => {
        // Painted before the state lands, so anything re-rendering on the
        // change — the charts read their colours off the root element — already
        // computes against the new palette.
        applyTheme(theme ?? get().deviceTheme)
        set({ theme })
      },
    }),
    {
      name: 'locale',
      storage: migratedStorage(),
      partialize: ({ locale, theme }) => ({ locale, theme }),
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

/**
 * Paints the app in the stored palette and keeps System following the device.
 *
 * Called by the app at startup, like startLocale — and the media-query
 * subscription lives here rather than in the store so a spec that never
 * starts it is not left with a listener it cannot remove.
 */
export const startTheme = (): void => {
  applyTheme(selectTheme(useLocaleStore.getState()))

  // Absent in jsdom; the boot script has already painted a first answer.
  const query = window.matchMedia?.('(prefers-color-scheme: dark)')
  query?.addEventListener('change', (event) => {
    useLocaleStore.setState({ deviceTheme: event.matches ? 'dark' : 'light' })
    applyTheme(selectTheme(useLocaleStore.getState()))
  })
}
