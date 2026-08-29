// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import { DateTime } from 'luxon'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { useStreakStore } from '@/stores/streak'
import { renderWithProviders } from '@/ui/testing'
import { StreakCard } from './StreakCard'

const weekKeyAgo = (weeksAgo: number) => {
  const week = DateTime.now().startOf('week').minus({ weeks: weeksAgo })
  return `${week.weekYear}-${week.weekNumber}`
}

const seed = (state: Partial<ReturnType<typeof useStreakStore.getState>>) =>
  useStreakStore.setState({ loaded: true, failed: false, ...state })

const ticks = () => screen.getAllByRole('listitem')

describe('StreakCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // A Friday, so the week in progress has three days left.
    vi.setSystemTime(new Date('2026-08-14T00:00:00Z'))
    vi.spyOn(useStreakStore.getState(), 'load').mockResolvedValue(undefined)
    useStreakStore.setState({
      streak: 0,
      thisWeekLogged: false,
      weekWorkoutCounts: {},
      loaded: false,
      failed: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // A partial fetch understates the streak, so the card says nothing rather
  // than reporting a confident zero.
  test.each([
    ['nothing has loaded', { loaded: false, failed: false }],
    ['the fetch failed', { loaded: true, failed: true }],
  ])('stays off screen while %s', (_case, state) => {
    useStreakStore.setState(state)
    const { container } = renderWithProviders(<StreakCard />)

    expect(container).toBeEmptyDOMElement()
  })

  test('invites a first streak when there is none', () => {
    seed({ streak: 0 })
    renderWithProviders(<StreakCard />)

    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('Start your streak')).toBeInTheDocument()
    expect(screen.getByText('Log a workout this week')).toBeInTheDocument()
  })

  test('leads with the count once the week is secured', () => {
    seed({ streak: 3, thisWeekLogged: true })
    renderWithProviders(<StreakCard />)

    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Week streak')).toBeInTheDocument()
    expect(screen.getByText('Secured this week')).toBeInTheDocument()
  })

  // A streak carried over from last week is alive but not yet secured: the
  // meta line says how long the user has to keep it.
  test('counts down the week while the streak is unsecured', () => {
    seed({ streak: 2, thisWeekLogged: false })
    renderWithProviders(<StreakCard />)

    expect(screen.getByText('Week streak')).toBeInTheDocument()
    expect(screen.getByText('3 days left this week')).toBeInTheDocument()
  })

  test('shows one tick per tracked week', () => {
    seed({ streak: 2, thisWeekLogged: true })
    renderWithProviders(<StreakCard />)

    expect(ticks()).toHaveLength(8)
  })

  test('tells each week apart for a screen reader', () => {
    seed({
      streak: 1,
      thisWeekLogged: false,
      weekWorkoutCounts: { [weekKeyAgo(1)]: 3 },
    })
    renderWithProviders(<StreakCard />)

    expect(ticks().at(-1)).toHaveAccessibleName('This week: workout still needed')
    expect(ticks().at(-2)).toHaveAccessibleName('1 week ago: 3 workouts logged')
    expect(ticks().at(0)).toHaveAccessibleName('7 weeks ago: outside current streak')
  })

  // A complete week always logged at least one workout, even when the count
  // was not fetched: "0 workouts logged" over a green tick reads as a bug.
  test('never announces a complete week as empty', () => {
    seed({ streak: 1, thisWeekLogged: true })
    renderWithProviders(<StreakCard />)

    expect(ticks().at(-1)).toHaveAccessibleName('This week: 1 workout logged')
  })
})
