// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test } from 'vitest'

import { useAnnouncementsStore } from '@/stores/announcements'
import { renderWithProviders } from '@/ui/testing'
import { AnnouncementSettings } from './AnnouncementSettings'

const render = () =>
  renderWithProviders(<AnnouncementSettings />, { route: '/settings/announcements' })

describe('AnnouncementSettings', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useAnnouncementsStore.setState({ volume: 'full' })
  })

  test('offers the three levels the recording screen cycles, full first', () => {
    render()

    const rows = screen.getAllByRole('button')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Full',
      'Low',
      'OffThe interval cue still sounds',
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
})
