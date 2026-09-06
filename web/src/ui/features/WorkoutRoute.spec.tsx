import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DistanceUnit } from '@/proto/api/v1/shared_pb'
import { usePreferencesStore } from '@/stores/preferences'
import { renderWithProviders } from '@/ui/testing'
import type { Recording } from '@/utils/timedCircuit'
import { WorkoutRoute } from './WorkoutRoute'

describe('WorkoutRoute', () => {
  beforeEach(() => usePreferencesStore.setState({ distanceUnit: DistanceUnit.KILOMETERS }))

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

  it('keeps one colour per exercise over different rounds and lists each interval', () => {
    renderWithProviders(<WorkoutRoute recording={recording()} />)
    const paths = screen.getByRole('img', { name: 'Workout route' }).querySelectorAll('path')
    expect(paths).toHaveLength(3)
    expect(paths[0].style.stroke).toBe('var(--color-route-1)')
    expect(paths[2].style.stroke).toBe(paths[0].style.stroke)
    expect(paths[1].style.stroke).toBe('var(--color-route-2)')
    expect(screen.getByText(/walk · Round 2/)).toBeVisible()
    expect(screen.getByText(/Active time 0:12/)).toHaveTextContent('km')
  })

  it('uses the preferred distance unit and explains an absent route', () => {
    usePreferencesStore.setState({ distanceUnit: DistanceUnit.MILES })
    renderWithProviders(<WorkoutRoute recording={{ ...recording(), points: [] }} />)
    expect(screen.getByText('No reliable route was recorded.')).toBeVisible()
    expect(screen.getByText(/Active time/)).toHaveTextContent('0.00 mi')
    expect(screen.getByRole('status')).toHaveTextContent('Tracking is incomplete')
  })
})
