// @vitest-environment jsdom

import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { useBottomChrome } from '@/stores/bottomChrome'
import { TOAST_DURATION_MS, useToastStore } from '@/stores/toasts'
import { renderWithProviders } from '@/ui/testing'
import { AppToaster } from './AppToaster'

const raise = () => useToastStore.getState()

/** Fake timers stop userEvent's own waiting, so it is pointed at them. */
const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

describe('AppToaster', () => {
  // Pinned 0.75rem off the bottom edge, it covered the tab bar on Exercises
  // and a routine's save on the screen reporting the routine had been saved.
  test('floats above whatever is pinned to the bottom', () => {
    useBottomChrome.setState({ pinned: { 'form-footer': 107 } })
    useToastStore.getState().success('Routine created')

    renderWithProviders(<AppToaster />)

    expect(screen.getByText('Routine created').closest('[style]')).toBeTruthy()
    const region = document.querySelector<HTMLElement>('[style*="--bottom-chrome"]')
    expect(region?.style.getPropertyValue('--bottom-chrome')).toBe('107px')
  })

  test('sits on the edge when nothing is pinned there', () => {
    useBottomChrome.setState({ pinned: {} })
    useToastStore.getState().success('Saved')

    renderWithProviders(<AppToaster />)

    const region = document.querySelector<HTMLElement>('[style*="--bottom-chrome"]')
    expect(region?.style.getPropertyValue('--bottom-chrome')).toBe('0px')
  })

  beforeEach(() => {
    // userEvent waits on timers of its own, so the clock keeps ticking with it.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    useToastStore.getState().dismiss()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('shows nothing when nothing has been raised', () => {
    renderWithProviders(<AppToaster />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test.each([
    ['success', 'status'],
    ['info', 'status'],
    ['error', 'alert'],
    ['warning', 'alert'],
  ] as const)('announces a %s as a %s', (type, role) => {
    raise()[type]('Workout saved')
    renderWithProviders(<AppToaster />)

    expect(screen.getByRole(role)).toHaveTextContent('Workout saved')
  })

  test('disappears on its own after a few seconds', () => {
    raise().success('Workout saved')
    renderWithProviders(<AppToaster />)

    wait(TOAST_DURATION_MS - 1)
    expect(screen.getByRole('status')).toBeInTheDocument()

    wait(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  test('can be dismissed before its time is up', async () => {
    raise().success('Workout saved')
    renderWithProviders(<AppToaster />)

    await user().click(screen.getByRole('button', { name: 'Dismiss message' }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  // Two of them stacked would cover the screen a phone has little of.
  test('shows the newest message in place of the one before it', () => {
    raise().success('Workout saved')
    raise().error('Could not save')
    renderWithProviders(<AppToaster />)

    expect(screen.queryByText('Workout saved')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save')
  })

  // A toast raised just before a navigation has to survive it, or it is gone
  // before the screen that explains it has rendered.
  test('shows a toast raised before it mounted', () => {
    raise().success('Workout saved')
    renderWithProviders(<AppToaster />)

    expect(screen.getByRole('status')).toHaveTextContent('Workout saved')
  })
})
