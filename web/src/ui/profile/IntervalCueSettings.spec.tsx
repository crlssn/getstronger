// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'

import { usePreferencesStore } from '@/stores/preferences'
import { renderWithProviders } from '@/ui/testing'
import { defaultCueLead } from '@/utils/intervalCue'
import { IntervalCueSettings } from './IntervalCueSettings'

const render = () =>
  renderWithProviders(<IntervalCueSettings />, { route: '/settings/interval-cue' })

describe('IntervalCueSettings', () => {
  beforeEach(() => {
    window.localStorage.clear()
    usePreferencesStore.setState({ intervalCueLeadSeconds: defaultCueLead })
  })

  test('offers silence and every lead the recorders read', () => {
    render()

    expect(screen.getByRole('button', { name: /Off/ })).toBeInTheDocument()
    for (const seconds of [5, 10, 15, 20]) {
      expect(screen.getByRole('button', { name: `${seconds} seconds` })).toBeInTheDocument()
    }
  })

  test('marks the lead in use, which is ten seconds until it is changed', () => {
    render()

    expect(screen.getByRole('button', { name: '10 seconds' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: '20 seconds' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  test('keeps a chosen lead, which the next recording is started with', async () => {
    render()

    await userEvent.click(screen.getByRole('button', { name: '20 seconds' }))

    expect(usePreferencesStore.getState().intervalCueLeadSeconds).toBe(20)
  })

  test('turns the cue off, and says what off means', async () => {
    render()

    expect(screen.getByText('Intervals end without a sound')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Off/ }))

    expect(usePreferencesStore.getState().intervalCueLeadSeconds).toBe(0)
  })

  // Nothing is sent anywhere, so a phone and a laptop are two devices with
  // two answers; the page says so rather than leaving it to be discovered.
  test('says the lead is this device only', () => {
    render()

    expect(screen.getByText(/this device/i)).toBeInTheDocument()
  })
})
