// @vitest-environment jsdom

import { act, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { quickWorkoutRoutineID, useWorkoutStore } from '@/stores/workout'
import { renderWithProviders } from '@/ui/testing'
import { AppRestTimerBanner } from './AppRestTimerBanner'

const now = new Date('2026-08-14T12:00:00Z')
const inSeconds = (seconds: number) => new Date(now.getTime() + seconds * 1000).toISOString()

const resting = (secondsLeft: number, totalSeconds = 90) => {
  useWorkoutStore.setState({
    workouts: {
      [quickWorkoutRoutineID]: {
        startedAt: '2026-08-14T11:50:00Z',
        exerciseSets: { squat: [{ weight: 100, reps: 5 }] },
        restTimerEndsAt: inSeconds(secondsLeft),
        restTimerTotalSeconds: totalSeconds,
      },
    },
  })
}

const banner = () => screen.queryByRole('region', { name: /Rest timer/ })

describe('AppRestTimerBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(now)
    useWorkoutStore.setState({ workouts: {} })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('says nothing when no rest is running', () => {
    renderWithProviders(<AppRestTimerBanner />, { route: '/home' })

    expect(banner()).not.toBeInTheDocument()
  })

  test('counts the rest down while the user is elsewhere', () => {
    resting(90)
    renderWithProviders(<AppRestTimerBanner />, { route: '/home' })

    expect(banner()).toHaveAccessibleName('Rest timer: 01:30')
  })

  // The workout screens run their own timer; this is for when the user has
  // left the session.
  test.each(['/workouts/quick', '/workouts/routine/routine-1'])(
    'stays out of the way on %s',
    (route) => {
      resting(90)
      renderWithProviders(<AppRestTimerBanner />, { route })

      expect(banner()).not.toBeInTheDocument()
    },
  )

  // Same shape as the banner on the workout itself: the digits are the whole
  // message, with no REST eyebrow and no clock icon beside them. Their size is
  // set in the stylesheet, so the one-row alignment is checked on screen.
  test('leads with the countdown alone, with no eyebrow beside it', () => {
    resting(90)
    renderWithProviders(<AppRestTimerBanner />, { route: '/home' })

    const copy = screen.getByText('01:30').parentElement
    expect(copy).toHaveTextContent(/^01:30$/)
    expect(copy?.querySelector('svg')).toBeNull()
  })

  test('offers a way back to the workout', () => {
    resting(90)
    renderWithProviders(<AppRestTimerBanner />, { route: '/home' })

    expect(screen.getByRole('link', { name: /Go to workout/ })).toHaveAttribute(
      'href',
      '/workouts/quick',
    )
  })

  test('ticks down', () => {
    resting(90)
    renderWithProviders(<AppRestTimerBanner />, { route: '/home' })

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(banner()).toHaveAccessibleName('Rest timer: 01:25')
  })

  // Once the rest is over the timer is cleared, which is what stops the tab
  // bar showing a countdown that has already finished.
  test('clears the timer when the rest runs out', () => {
    resting(2)
    renderWithProviders(<AppRestTimerBanner />, { route: '/home' })

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(
      useWorkoutStore.getState().workouts[quickWorkoutRoutineID]?.restTimerEndsAt,
    ).toBeUndefined()
    expect(banner()).not.toBeInTheDocument()
  })

  // Each timer is retired once; without that the expiry would fire on every
  // tick afterwards and keep pulling the user back.
  test('retires a finished timer only once', () => {
    resting(1)
    const setRestTimer = vi.spyOn(useWorkoutStore.getState(), 'setRestTimer')
    renderWithProviders(<AppRestTimerBanner />, { route: '/home' })

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(setRestTimer).toHaveBeenCalledTimes(1)
    setRestTimer.mockRestore()
  })
})
