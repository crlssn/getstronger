import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DistanceUnit } from '@/proto/api/v1/shared_pb'
import { usePreferencesStore } from '@/stores/preferences'
import { renderWithProviders } from '@/ui/testing'
import type { Recording } from '@/utils/timedCircuit'
import { WorkoutRoute } from './WorkoutRoute'

// jsdom has no WebGL, so the card falls back to the bare shape of the route
// unless a test says otherwise. The map itself is covered by RouteMap's spec.
const browser = { webgl: false }
vi.mock('@/utils/mapSupport', () => ({ mapSupported: () => browser.webgl }))
vi.mock('./RouteMap', () => ({
  RouteMap: () => <div role="region" aria-label="Route map" />,
}))

describe('WorkoutRoute', () => {
  beforeEach(() => {
    browser.webgl = false
    usePreferencesStore.setState({ distanceUnit: DistanceUnit.KILOMETERS })
  })

  const recording = (): Recording => ({
    version: 1,
    startedAt: 1000,
    endedAt: 13000,
    interrupted: false,
    pauses: [],
    phases: ['walk', 'run', 'walk'].map((name, index) => ({
      exerciseId: name,
      stationKey: name,
      name,
      round: index === 2 ? 2 : 1,
      durationSeconds: 4,
      instruction: name,
    })),
    points: Array.from({ length: 13 }, (_, index) => ({
      timestamp: 1000 + index * 1000,
      latitude: 51,
      longitude: index * 0.0001,
      accuracy: 3,
    })),
  })

  const roundRows = () =>
    screen
      .getAllByRole('listitem')
      .filter((item) => within(item).queryByText(/^Round \d+$/) !== null)

  it('keeps one colour per exercise over different rounds', () => {
    renderWithProviders(<WorkoutRoute recording={recording()} />)
    const paths = screen.getByRole('img', { name: 'Workout route' }).querySelectorAll('path')
    expect(paths).toHaveLength(3)
    expect(paths[0].style.stroke).toBe('var(--color-route-1)')
    expect(paths[2].style.stroke).toBe(paths[0].style.stroke)
    expect(paths[1].style.stroke).toBe('var(--color-route-2)')
  })

  // Twelve lines saying "Walk · Round 1" then "Run · Round 1" are six laps of
  // the same loop, and a reader counting them is doing the grouping by hand.
  it('groups the intervals into the rounds they were run in', () => {
    renderWithProviders(<WorkoutRoute recording={recording()} />)

    expect(screen.getByText('2 rounds')).toBeVisible()

    const rounds = roundRows()
    expect(rounds).toHaveLength(2)
    expect(within(rounds[0]).getByText('walk')).toBeVisible()
    expect(within(rounds[0]).getByText('run')).toBeVisible()
    // The last round was cut short, and the row says so by having one interval.
    expect(within(rounds[1]).queryByText('run')).not.toBeInTheDocument()
  })

  // What the circuit asked for, read off its first round, so the rows below
  // only have to say how each of them actually went.
  it('heads the rounds with what the circuit prescribed', () => {
    renderWithProviders(<WorkoutRoute recording={recording()} />)

    expect(screen.getByText('walk 0:04 → run 0:04')).toBeVisible()
  })

  it('totals the session in a tile for each measure', () => {
    renderWithProviders(<WorkoutRoute recording={recording()} />)

    const active = screen.getByText('Active time').closest('div')
    expect(within(active!).getByText('0:12')).toBeVisible()

    const distance = screen.getByText('Recorded distance').closest('div')
    expect(within(distance!).getByText('km')).toBeVisible()

    // A gym circuit covers no ground worth a pace.
    expect(screen.queryByText('Average pace')).not.toBeInTheDocument()
  })

  // The tiles are somebody else's, and the licence asks to be told so beside
  // the map rather than by the map's own 24px control sitting over the route.
  it('credits the tiles when the map is what was drawn', () => {
    browser.webgl = true
    renderWithProviders(<WorkoutRoute recording={recording()} />)

    expect(screen.getByRole('region', { name: 'Route map' })).toBeInTheDocument()
    expect(screen.getByText(/Data from OpenStreetMap/)).toBeVisible()
  })

  it('credits nobody for a route it drew itself', () => {
    renderWithProviders(<WorkoutRoute recording={recording()} />)

    expect(screen.queryByText(/Data from OpenStreetMap/)).not.toBeInTheDocument()
  })

  it('uses the preferred distance unit and explains an absent route', () => {
    usePreferencesStore.setState({ distanceUnit: DistanceUnit.MILES })
    renderWithProviders(<WorkoutRoute recording={{ ...recording(), points: [] }} />)

    expect(screen.getByText('No reliable route was recorded.')).toBeVisible()
    expect(screen.getByText('Recorded distance').closest('div')).toHaveTextContent('0.00mi')
    expect(screen.getByRole('status')).toHaveTextContent('Tracking is incomplete')
  })

  // An interval routine is one session with a shape, so it reads as one list
  // rather than as the three parts it was built from.
  describe('an interval session', () => {
    // A warm-up walk, then two rounds of run and walk, the last walk dropped.
    const intervals = (): Recording => ({
      ...recording(),
      endedAt: 21000,
      phases: [
        { name: 'walk', role: 'warmup' as const, round: 1 },
        { name: 'run', role: 'repeat' as const, round: 1 },
        { name: 'walk', role: 'repeat' as const, round: 1 },
        { name: 'run', role: 'repeat' as const, round: 2 },
        { name: 'walk', role: 'cooldown' as const, round: 1 },
      ].map(({ name, role, round }) => ({
        exerciseId: name,
        stationKey: name,
        name,
        round,
        role,
        durationSeconds: 4,
        instruction: name,
      })),
      points: Array.from({ length: 21 }, (_, index) => ({
        timestamp: 1000 + index * 1000,
        latitude: 51,
        longitude: index * 0.0001,
        accuracy: 3,
      })),
    })

    const intervalRows = () =>
      screen.getAllByRole('listitem').filter((item) => within(item).queryByText('/km') !== null)

    it('numbers every interval straight through, whatever part it came from', () => {
      renderWithProviders(<WorkoutRoute recording={intervals()} />)

      const rows = intervalRows()
      expect(rows).toHaveLength(5)
      expect(rows.map((row) => within(row).getByText(/^[1-9]$/).textContent)).toEqual([
        '1',
        '2',
        '3',
        '4',
        '5',
      ])
    })

    // The round is where an interval sits in the sequence, not a heading over a
    // group of them — and the warm-up and cool-down sit outside the count.
    it('says the round under the name, and only inside the block', () => {
      renderWithProviders(<WorkoutRoute recording={intervals()} />)

      const rows = intervalRows()
      expect(within(rows[0]).getByText('Warm-up')).toBeVisible()
      expect(within(rows[1]).getByText('Round 1 of 2')).toBeVisible()
      expect(within(rows[3]).getByText('Round 2 of 2')).toBeVisible()
      expect(within(rows[4]).getByText('Cool-down')).toBeVisible()
      expect(screen.getByText('2 rounds')).toBeVisible()
    })

    // The number the session was for, on every row and once over the whole of
    // it — which is a tile a gym circuit never earns.
    it('paces each interval on its own row, and the session as a whole', () => {
      renderWithProviders(<WorkoutRoute recording={intervals()} />)

      // Five rows and the tile beside the totals.
      expect(screen.getAllByText('/km')).toHaveLength(6)
      expect(intervalRows().every((row) => within(row).queryByText('—') === null)).toBe(true)
      expect(screen.getByText('Average pace')).toBeVisible()
    })

    // What the routine asked for: the warm-up once, the block with its count in
    // front of it, the cool-down after.
    it('heads the sequence with the prescription', () => {
      renderWithProviders(<WorkoutRoute recording={intervals()} />)

      expect(screen.getByText('walk 0:04 · 2 × (run 0:04 → walk 0:04) · walk 0:04')).toBeVisible()
    })

    // The block dropped its last walk, so the sequence ends on the run and the
    // final round is a row shorter than the ones before it.
    it('ends the block on the run when the final round skipped its last', () => {
      renderWithProviders(<WorkoutRoute recording={intervals()} />)

      const rows = intervalRows()
      expect(within(rows[3]).getByText('run')).toBeVisible()
      expect(rows.filter((row) => within(row).queryByText('walk') !== null)).toHaveLength(3)
    })
  })
})
