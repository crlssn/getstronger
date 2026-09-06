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
})
