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

const blocks = () => screen.getAllByRole('listitem')

describe('StreakCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
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

    expect(screen.getByText('Start your streak')).toBeInTheDocument()
    expect(screen.queryByText('1')).not.toBeInTheDocument()
  })

  test('counts the weeks once a streak is running', () => {
    seed({ streak: 3, thisWeekLogged: true })
    renderWithProviders(<StreakCard />)

    expect(screen.getByText('3 weeks')).toBeInTheDocument()
  })

  test('shows only a check for one workout and adds the count for more', () => {
    seed({
      streak: 2,
      thisWeekLogged: true,
      weekWorkoutCounts: { [weekKeyAgo(1)]: 1, [weekKeyAgo(0)]: 3 },
    })
    renderWithProviders(<StreakCard />)

    const [oneWorkout, multiple] = blocks().slice(-2)
    expect(oneWorkout).not.toHaveTextContent(/\d/)
    expect(multiple).toHaveTextContent('3')
    expect(multiple).toHaveAccessibleName(/3 workouts logged/)
  })

  // The block has room for two characters; the real number still reaches a
  // screen reader.
  test('caps the visible count at 9+ while announcing the actual count', () => {
    seed({ streak: 1, thisWeekLogged: true, weekWorkoutCounts: { [weekKeyAgo(0)]: 12 } })
    renderWithProviders(<StreakCard />)

    const current = blocks().at(-1)
    expect(current).toHaveTextContent('9+')
    expect(current).toHaveAccessibleName(/12 workouts logged/)
  })

  test('tells each week apart for a screen reader', () => {
    seed({ streak: 1, thisWeekLogged: false })
    renderWithProviders(<StreakCard />)

    expect(blocks().at(-1)).toHaveAccessibleName('This week: workout still needed')
    expect(blocks().at(-2)).toHaveAccessibleName(/^1 week ago: /)
    expect(blocks().at(0)).toHaveAccessibleName('4 weeks ago: outside current streak')
  })
})
