// @vitest-environment jsdom

import { describe, expect, test } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import type { Recording } from '@/utils/timedCircuit'
import { RouteThumbnail } from './RouteThumbnail'

// A diagonal walked at a plausible pace: a fix a second, a few metres apart.
const trace = (count: number, seconds: number) =>
  Array.from({ length: count }, (_, index) => ({
    timestamp: 1000 + index * seconds * 1000,
    latitude: 51 + index * 0.00003,
    longitude: index * 0.0001,
    accuracy: 3,
  }))

const recording = (fields: Partial<Recording> = {}): Recording => ({
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
  points: trace(13, 1),
  ...fields,
})

const drawn = (container: HTMLElement) => [...container.querySelectorAll('polyline')]

describe('RouteThumbnail', () => {
  test('draws one line per interval, in the colour the full map gives it', () => {
    const { container } = renderWithProviders(<RouteThumbnail recording={recording()} />)

    const lines = drawn(container)
    expect(lines).toHaveLength(3)
    expect(lines[0].style.stroke).toBe('var(--color-route-1)')
    expect(lines[1].style.stroke).toBe('var(--color-route-2)')
    expect(lines[2].style.stroke).toBe(lines[0].style.stroke)
  })

  test('keeps every point inside the tile it is drawn in', () => {
    const { container } = renderWithProviders(<RouteThumbnail recording={recording()} />)

    const coordinates = drawn(container)
      .flatMap((line) => line.getAttribute('points')?.split(' ') ?? [])
      .flatMap((pair) => pair.split(',').map(Number))

    expect(coordinates.length).toBeGreaterThan(0)
    coordinates.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(44)
    })
  })

  // A 44px tile cannot show a fix every five seconds, and the feed draws ten
  // of these at once.
  test('thins a long recording to a handful of points', () => {
    const long = recording({
      endedAt: 3_001_000,
      phases: [
        {
          exerciseId: 'run',
          stationKey: 'run',
          name: 'run',
          round: 1,
          durationSeconds: 3000,
          instruction: 'run',
        },
      ],
      points: trace(600, 5),
    })

    const { container } = renderWithProviders(<RouteThumbnail recording={long} />)

    const count = drawn(container)[0].getAttribute('points')?.split(' ').length ?? 0
    expect(count).toBeGreaterThan(1)
    expect(count).toBeLessThanOrEqual(45)
  })

  // The row's own link already names the workout; the tile is a picture of it.
  test('says nothing to a screen reader', () => {
    const { container } = renderWithProviders(<RouteThumbnail recording={recording()} />)

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  test('renders nothing when the session recorded no usable route', () => {
    const { container } = renderWithProviders(
      <RouteThumbnail recording={recording({ points: [] })} />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
