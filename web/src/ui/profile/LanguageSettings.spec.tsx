// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeEach, describe, expect, test } from 'vitest'

import { i18n } from '@/i18n'
import { useLocaleStore } from '@/stores/locale'
import { renderWithProviders } from '@/ui/testing'
import { LanguageSettings } from './LanguageSettings'

const render = () => renderWithProviders(<LanguageSettings />, { route: '/settings/language' })

describe('LanguageSettings', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    useLocaleStore.setState({ locale: undefined })
    await i18n.changeLanguage('en')
  })

  afterAll(async () => {
    useLocaleStore.setState({ locale: undefined })
    await i18n.changeLanguage('en')
  })

  // Every language is offered in its own name: a reader who cannot read the
  // current one still recognises theirs.
  test('offers the device and every language the app speaks', () => {
    render()

    // The device row carries the language it resolves to, so it reads as
    // 'Device language English' rather than as a second English row.
    expect(screen.getByRole('button', { name: /Device language/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Svenska' })).toBeInTheDocument()
  })

  test('marks the one in use, which is the device until a choice is made', () => {
    render()

    expect(screen.getByRole('button', { name: /Device language/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Svenska' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('switches the app the moment a language is picked', async () => {
    render()

    await userEvent.click(screen.getByRole('button', { name: 'Svenska' }))

    expect(useLocaleStore.getState().locale).toBe('sv')
    expect(i18n.language).toBe('sv')
    // The screen it was chosen on is the first thing to be read back.
    expect(screen.getByRole('button', { name: /Enhetens språk/ })).toBeInTheDocument()
  })

  test('hands the choice back to the device', async () => {
    useLocaleStore.getState().setLocale('sv')
    render()

    await userEvent.click(screen.getByRole('button', { name: /Enhetens språk/ }))

    expect(useLocaleStore.getState().locale).toBeUndefined()
    expect(i18n.language).toBe('en')
  })

  // Nothing is sent anywhere, so there is nothing to fail or to reconcile: the
  // page says so rather than leaving the reader to wonder about the other
  // devices they are signed in on.
  test('says the choice is this device only', () => {
    render()

    expect(screen.getByText(/only this device/i)).toBeInTheDocument()
  })
})
