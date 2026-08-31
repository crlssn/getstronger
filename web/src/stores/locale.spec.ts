// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from 'vitest'

import { i18n } from '@/i18n'
import { selectLocale, selectTheme, startLocale, startTheme, useLocaleStore } from './locale'

describe('useLocaleStore', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    useLocaleStore.setState({ locale: undefined, theme: undefined, deviceTheme: 'light' })
    delete document.documentElement.dataset.theme
    await i18n.changeLanguage('en')
  })

  // Nobody has chosen, so the device decides — and the specs run in a jsdom
  // that asks for English.
  test('follows the device until a language is chosen', () => {
    expect(selectLocale(useLocaleStore.getState())).toBe('en')

    useLocaleStore.getState().setLocale('sv')

    expect(selectLocale(useLocaleStore.getState())).toBe('sv')
  })

  test('switches the catalogue the moment it is chosen', () => {
    useLocaleStore.getState().setLocale('sv')

    expect(i18n.t('common.save')).toBe('Spara')
    expect(document.documentElement.lang).toBe('sv')
  })

  // Choosing the device again is a choice to stop having one.
  test('goes back to the device when the choice is cleared', () => {
    useLocaleStore.getState().setLocale('sv')
    useLocaleStore.getState().setLocale(undefined)

    expect(useLocaleStore.getState().locale).toBeUndefined()
    expect(i18n.t('common.save')).toBe('Save')
  })

  // The app applies the stored choice itself: a store that switched the
  // catalogue on import would do it in whatever order the bundler resolved it.
  test('applies the stored choice when the app starts it', () => {
    useLocaleStore.setState({ locale: 'sv' })

    startLocale()

    expect(i18n.t('common.save')).toBe('Spara')
  })

  test('keeps the choice on the device', () => {
    useLocaleStore.getState().setLocale('sv')

    expect(JSON.parse(window.localStorage.getItem('locale') ?? '{}')).toMatchObject({
      state: { locale: 'sv' },
    })
  })

  // The palette shares the store: like the language, it is a per-device
  // reading preference with no field on the account.
  describe('theme', () => {
    test('follows the device until a palette is chosen', () => {
      expect(selectTheme(useLocaleStore.getState())).toBe('light')

      useLocaleStore.getState().setTheme('dark')

      expect(selectTheme(useLocaleStore.getState())).toBe('dark')
    })

    test('paints the root element the moment it is chosen', () => {
      useLocaleStore.getState().setTheme('dark')

      expect(document.documentElement.dataset.theme).toBe('dark')
    })

    // Choosing the device again is a choice to stop having one.
    test('goes back to the device when the choice is cleared', () => {
      useLocaleStore.getState().setTheme('dark')
      useLocaleStore.getState().setTheme(undefined)

      expect(useLocaleStore.getState().theme).toBeUndefined()
      expect(document.documentElement.dataset.theme).toBe('light')
    })

    // The app applies the stored choice itself: a store that painted the page
    // on import would do it in whatever order the bundler resolved it.
    test('applies the stored choice when the app starts it', () => {
      useLocaleStore.setState({ theme: 'dark' })

      startTheme()

      expect(document.documentElement.dataset.theme).toBe('dark')
    })

    // System is live: while the app is open, the device changing its mind
    // repaints the page — unless a palette was chosen, which overrides it.
    test('follows the device while it moves, until overridden', () => {
      const original = window.matchMedia
      let listener: ((event: { matches: boolean }) => void) | undefined
      window.matchMedia = ((query: string) => ({
        addEventListener: (_: string, handler: (event: { matches: boolean }) => void) => {
          listener = handler
        },
        matches: false,
        media: query,
      })) as unknown as typeof window.matchMedia

      try {
        startTheme()
        listener?.({ matches: true })

        expect(useLocaleStore.getState().deviceTheme).toBe('dark')
        expect(document.documentElement.dataset.theme).toBe('dark')

        useLocaleStore.getState().setTheme('light')
        listener?.({ matches: false })

        expect(document.documentElement.dataset.theme).toBe('light')
      } finally {
        window.matchMedia = original
      }
    })

    test('keeps the choice on the device, beside the language', () => {
      useLocaleStore.getState().setTheme('dark')

      expect(JSON.parse(window.localStorage.getItem('locale') ?? '{}')).toMatchObject({
        state: { theme: 'dark' },
      })
    })
  })
})
