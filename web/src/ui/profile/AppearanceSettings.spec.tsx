// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeEach, describe, expect, test } from 'vitest'

import { useLocaleStore } from '@/stores/locale'
import { renderWithProviders } from '@/ui/testing'
import { AppearanceSettings } from './AppearanceSettings'

const render = () => renderWithProviders(<AppearanceSettings />, { route: '/settings/appearance' })

describe('AppearanceSettings', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useLocaleStore.setState({ theme: undefined, deviceTheme: 'light' })
    delete document.documentElement.dataset.theme
  })

  afterAll(() => {
    useLocaleStore.setState({ theme: undefined, deviceTheme: 'light' })
    delete document.documentElement.dataset.theme
  })

  test('offers the device and both palettes', () => {
    render()

    // The device row carries the palette it resolves to, so it reads as
    // 'Device appearance Light' rather than as a second Light row.
    expect(screen.getByRole('button', { name: /Device appearance/ })).toHaveTextContent('Light')
    expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument()
  })

  test('marks the one in use, which is the device until a choice is made', () => {
    render()

    expect(screen.getByRole('button', { name: /Device appearance/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('paints the app the moment a palette is picked', async () => {
    render()

    await userEvent.click(screen.getByRole('button', { name: 'Dark' }))

    expect(useLocaleStore.getState().theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  test('hands the choice back to the device', async () => {
    useLocaleStore.getState().setTheme('dark')
    render()

    await userEvent.click(screen.getByRole('button', { name: /Device appearance/ }))

    expect(useLocaleStore.getState().theme).toBeUndefined()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  // Nothing is sent anywhere, so there is nothing to fail or to reconcile: the
  // page says so rather than leaving the reader to wonder about the other
  // devices they are signed in on.
  test('says the choice is this device only', () => {
    render()

    expect(screen.getByText(/only this device/i)).toBeInTheDocument()
  })
})
