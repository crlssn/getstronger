// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { previewPaceTones } from '@/native/audioPreview'
import { useAnnouncementsStore } from '@/stores/announcements'
import { usePreferencesStore } from '@/stores/preferences'
import { renderWithProviders } from '@/ui/testing'
import { PaceToneSettings } from './PaceToneSettings'

vi.mock('@/native/audioPreview', () => ({
  previewAnnouncement: vi.fn(),
  previewIntervalCue: vi.fn(),
  previewPaceTones: vi.fn(),
}))

const render = () => renderWithProviders(<PaceToneSettings />, { route: '/settings/pace-tones' })

describe('PaceToneSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    useAnnouncementsStore.setState({ volume: 'full' })
    usePreferencesStore.getState().reset()
  })

  test('offers off and the two sessions to compare with, off chosen by default', () => {
    render()

    const rows = screen.getAllByRole('button')
    expect(rows.map((row) => row.textContent)).toEqual([
      'OffRecorded without a comparison',
      'Last sessionAgainst your most recent recording',
      'Best sessionAgainst your fastest recording',
    ])
    expect(screen.getByRole('button', { name: /Off/ })).toHaveAttribute('aria-pressed', 'true')
  })

  test('keeps the choice for the next recording', async () => {
    const user = userEvent.setup()
    render()

    await user.click(screen.getByRole('button', { name: /Best session/ }))

    expect(screen.getByRole('button', { name: /Best session/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /Off/ })).toHaveAttribute('aria-pressed', 'false')
    expect(usePreferencesStore.getState().paceReference).toBe('best')
  })

  // Two notes nobody can describe in words: picking a comparison plays the
  // pair the run will sound.
  test('sounds the pair of notes for the comparison just picked', async () => {
    const user = userEvent.setup()
    render()

    await user.click(screen.getByRole('button', { name: /Last session/ }))

    expect(previewPaceTones).toHaveBeenCalledWith('previous', 'full', 'Faster', 'Slower')
  })
})
