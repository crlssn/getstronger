// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from 'vitest'

import { i18n } from '@/i18n'
import { selectLocale, startLocale, useLocaleStore } from './locale'

describe('useLocaleStore', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    useLocaleStore.setState({ locale: undefined })
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
})
