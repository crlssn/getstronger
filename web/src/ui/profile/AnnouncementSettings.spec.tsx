// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { previewAnnouncement } from '@/native/audioPreview'
import { useAnnouncementsStore } from '@/stores/announcements'
import { renderWithProviders } from '@/ui/testing'
import { AnnouncementSettings } from './AnnouncementSettings'

vi.mock('@/native/audioPreview', () => ({
  previewAnnouncement: vi.fn(),
  previewIntervalCue: vi.fn(),
  previewPaceTones: vi.fn(),
}))

const render = () =>
  renderWithProviders(<AnnouncementSettings />, { route: '/settings/announcements' })

describe('AnnouncementSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    useAnnouncementsStore.setState({ volume: 'full' })
  })

  test('offers the three levels the recording screen cycles, full first', () => {
    render()

    const rows = screen.getAllByRole('button')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Full',
      'Low',
      'OffThe interval cue is still called out',
    ])
    expect(screen.getByRole('button', { name: 'Full' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('keeps the level for the next recording', async () => {
    const user = userEvent.setup()
    render()

    await user.click(screen.getByRole('button', { name: 'Low' }))

    expect(screen.getByRole('button', { name: 'Low' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Full' })).toHaveAttribute('aria-pressed', 'false')
    expect(useAnnouncementsStore.getState().volume).toBe('low')
  })

  // A level is a thing you hear, and nowhere in the app is it heard except on
  // a run: the row answers in the voice it is choosing between.
  test('speaks an example at the level just picked', async () => {
    const user = userEvent.setup()
    render()

    await user.click(screen.getByRole('button', { name: 'Low' }))

    expect(previewAnnouncement).toHaveBeenCalledWith('Run for 2 minutes', 'low')
  })
})
