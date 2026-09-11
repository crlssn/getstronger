// @vitest-environment jsdom

import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { previewPaceTone } from '@/native/audioPreview'
import { useAnnouncementsStore } from '@/stores/announcements'
import { usePreferencesStore } from '@/stores/preferences'
import { renderWithProviders } from '@/ui/testing'
import { PaceToneSettings } from './PaceToneSettings'

vi.mock('@/native/audioPreview', () => ({
  previewAnnouncement: vi.fn(),
  previewIntervalCue: vi.fn(),
  previewPaceTone: vi.fn(),
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

    const rows = within(screen.getByRole('region', { name: 'Pace tones' })).getAllByRole('button')
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

  // A note is the one thing a settings row cannot describe, so the screen
  // offers each one under its own name rather than saying the words out loud.
  test('sounds each note from a button of its own, under the comparison', async () => {
    const user = userEvent.setup()
    render()

    const example = screen.getByRole('group', { name: 'Audio example' })
    await user.click(within(example).getByRole('button', { name: 'Faster' }))
    expect(previewPaceTone).toHaveBeenCalledExactlyOnceWith('ahead', 'full')

    await user.click(within(example).getByRole('button', { name: 'Slower' }))
    expect(previewPaceTone).toHaveBeenLastCalledWith('behind', 'full')
  })

  // Choosing which session to compare with is not a request to hear anything:
  // the example is a button, and it is the only thing that sounds a note.
  test('sounds nothing when a comparison is chosen', async () => {
    const user = userEvent.setup()
    render()

    await user.click(screen.getByRole('button', { name: /Last session/ }))

    expect(usePreferencesStore.getState().paceReference).toBe('previous')
    expect(previewPaceTone).not.toHaveBeenCalled()
  })
})
