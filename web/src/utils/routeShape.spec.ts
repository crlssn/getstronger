import { describe, expect, test } from 'vitest'

import type { Recording, RoutePoint } from './timedCircuit'
import { fitRoute, routeIntervals, routeRuns, routeStride, thinRun } from './routeShape'

const point = (fields: Partial<RoutePoint>): RoutePoint => ({
  timestamp: 0,
  latitude: 0,
  longitude: 0,
  accuracy: 3,
  ...fields,
})

// A walk, a run, then the same walk again in a second round: the colour rule
// keys on the exercise, so the third interval takes the first one's colour.
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
  points: Array.from({ length: 13 }, (_, index) =>
    point({ timestamp: 1000 + index * 1000, latitude: 51, longitude: index * 0.0001 }),
  ),
})

describe('routeIntervals', () => {
  test('leaves out the rest between two intervals', () => {
    const rested = recording()
    rested.endedAt = 17000
    rested.phases = [
      rested.phases[0],
      { ...rested.phases[0], exerciseId: '', name: 'Rest' },
      rested.phases[1],
      rested.phases[2],
    ]

    const { routes } = routeIntervals(rested)

    expect(routes.map((route) => route.phase.name)).toEqual(['walk', 'run', 'walk'])
  })

  test('leaves out an interval the session was stopped before', () => {
    const { routes } = routeIntervals({ ...recording(), endedAt: 5000 })

    expect(routes.map((route) => route.phase.name)).toEqual(['walk'])
  })

  test('gives every exercise one colour, whichever round it ran in', () => {
    const { colorToken } = routeIntervals(recording())

    expect(colorToken('walk')).toBe('--color-route-1')
    expect(colorToken('run')).toBe('--color-route-2')
  })

  // Six hues, then round: a seventh exercise takes the first one's colour
  // rather than a token the theme does not define.
  test('cycles through the palette rather than running off its end', () => {
    const many = recording()
    many.endedAt = 29000
    many.phases = Array.from({ length: 7 }, (_, index) => ({
      ...many.phases[0],
      exerciseId: `exercise-${index}`,
      name: `exercise-${index}`,
    }))

    const { colorToken } = routeIntervals(many)

    expect(colorToken('exercise-6')).toBe(colorToken('exercise-0'))
  })
})

describe('routeRuns', () => {
  test('joins edges that share a fix into one unbroken run', () => {
    const a = point({ timestamp: 1 })
    const b = point({ timestamp: 2 })
    const c = point({ timestamp: 3 })

    expect(
      routeRuns([
        [a, b],
        [b, c],
      ]),
    ).toEqual([[a, b, c]])
  })

  test('starts a new run where the route was interrupted', () => {
    const a = point({ timestamp: 1 })
    const b = point({ timestamp: 2 })
    const c = point({ timestamp: 9 })
    const d = point({ timestamp: 10 })

    expect(
      routeRuns([
        [a, b],
        [c, d],
      ]),
    ).toEqual([
      [a, b],
      [c, d],
    ])
  })

  test('draws nothing for a route with no accepted edges', () => {
    expect(routeRuns([])).toEqual([])
  })
})

describe('fitRoute', () => {
  // Twice as wide as it is tall, so the two axes are told apart.
  const points = [
    point({ latitude: 0, longitude: 0 }),
    point({ latitude: 0, longitude: 1 }),
    point({ latitude: -0.5, longitude: 1 }),
  ]

  test('fills the box between the padding on its longest axis', () => {
    const fit = fitRoute(points, 44, 6)

    expect(fit(points[0]).x).toBeCloseTo(6)
    expect(fit(points[1]).x).toBeCloseTo(38)
  })

  // A route wider than it is tall hugged the top of its box, which reads as a
  // mistake at 44px.
  test('centres the shape on the axis it does not fill', () => {
    const fit = fitRoute(points, 44, 6)

    expect(44 - fit(points[2]).y).toBeCloseTo(fit(points[0]).y)
    expect(fit(points[0]).y).toBeGreaterThan(6)
  })

  test('puts a route that never moved in the middle of the box', () => {
    const stood = point({ latitude: 51, longitude: 13 })

    expect(fitRoute([stood], 44, 6)(stood)).toEqual({ x: 22, y: 22 })
  })

  test('takes the short way round when a route crosses the date line', () => {
    const across = [point({ longitude: 179.9 }), point({ longitude: -179.9 })]
    const fit = fitRoute(across, 44, 6)

    expect(fit(across[0]).x).toBeCloseTo(6)
    expect(fit(across[1]).x).toBeCloseTo(38)
  })
})

describe('thinning a route', () => {
  const run = (length: number) => Array.from({ length }, (_, index) => point({ timestamp: index }))

  test('leaves a route small enough to draw as it is', () => {
    const runs = [run(10), run(10)]

    expect(routeStride(runs, 40)).toBe(1)
    expect(thinRun(runs[0], 1)).toEqual(runs[0])
  })

  test('strides far enough to bring a long route near the limit', () => {
    const long = run(400)

    expect(thinRun(long, routeStride([long], 40))).toHaveLength(41)
  })

  test('keeps both ends so the intervals still meet', () => {
    const thinned = thinRun(run(10), 4)

    expect(thinned.map((fix) => fix.timestamp)).toEqual([0, 4, 8, 9])
  })
})
