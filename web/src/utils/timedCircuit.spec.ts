import { describe, expect, it } from 'vitest'
import { create } from '@bufbuild/protobuf'
import { RoutineGroupSchema } from '@/proto/api/v1/routine_service_pb'
import { RoutineGroupMode } from '@/proto/api/v1/shared_pb'
import { RoutineGroupRole } from '@/proto/api/v1/shared_pb'
import {
  buildTimeline,
  circuitPhases,
  currentPace,
  edgeMeters,
  isIntervalRecording,
  measureRoute,
  namedRecording,
  openSessionPhases,
  paceFloorMeters,
  parseRecording,
  recordedRounds,
  type Recording,
  type RoutePoint,
} from './timedCircuit'

/** The walk-run of the ticket: a longer first walk, then five rounds of both. */
const walkRunGroups = (skipLastOnFinalRound: boolean) => [
  create(RoutineGroupSchema, {
    mode: RoutineGroupMode.CIRCUIT,
    rounds: 1,
    role: RoutineGroupRole.WARMUP,
    exercises: [{ exercise: { id: 'walk', name: 'Walk' }, targetDurationSeconds: 300 }],
  }),
  create(RoutineGroupSchema, {
    mode: RoutineGroupMode.CIRCUIT,
    rounds: 5,
    role: RoutineGroupRole.REPEAT,
    skipLastOnFinalRound,
    exercises: [
      { exercise: { id: 'run', name: 'Run' }, targetDurationSeconds: 60 },
      { exercise: { id: 'walk', name: 'Walk' }, targetDurationSeconds: 120 },
    ],
  }),
]

const phasesOf = (skipLastOnFinalRound: boolean) =>
  circuitPhases(
    walkRunGroups(skipLastOnFinalRound),
    (name, seconds) => `${name} ${seconds}`,
    'Rest',
  )

const recording = (): Recording => ({
  version: 1,
  startedAt: 1000,
  endedAt: 361000,
  phases: [
    {
      exerciseId: 'walk',
      stationKey: 'walk',
      name: 'Walk',
      round: 1,
      durationSeconds: 120,
      instruction: 'Walk',
    },
    {
      exerciseId: 'run',
      stationKey: 'run',
      name: 'Run',
      round: 1,
      durationSeconds: 240,
      instruction: 'Run',
    },
  ],
  pauses: [],
  points: [],
  interrupted: false,
})

describe('recorded timeline', () => {
  it('builds twelve configured intervals and 36 minutes for the six-round example', () => {
    const phases = circuitPhases(
      [
        create(RoutineGroupSchema, {
          mode: RoutineGroupMode.CIRCUIT,
          rounds: 6,
          exercises: [
            { exercise: { id: 'walk', name: 'Walk' }, targetDurationSeconds: 120 },
            { exercise: { id: 'run', name: 'Run' }, targetDurationSeconds: 240 },
          ],
        }),
      ],
      (name, seconds) => `${name} ${seconds}`,
      'Rest',
    )
    expect(phases).toHaveLength(12)
    expect(phases.reduce((sum, phase) => sum + (phase.durationSeconds ?? 0), 0)).toBe(2160)
    expect(phases[11]).toMatchObject({ exerciseId: 'run', round: 6, instruction: 'Run 240' })
  })

  it('keeps rest phases out of exercise distances and preserves repeated stations', () => {
    const group = create(RoutineGroupSchema, {
      mode: RoutineGroupMode.CIRCUIT,
      rounds: 2,
      restBetweenRoundsSeconds: 10,
      exercises: [{ exercise: { id: 'a', name: 'Custom' }, targetDurationSeconds: 7 }],
    })
    const phases = circuitPhases([group, group], (name) => name, 'Rest')
    expect(phases.map((phase) => phase.stationKey)).toEqual(['a', 'a', 'a', 'a#2', 'a#2', 'a#2'])
    expect(phases[1].exerciseId).toBe('')
    expect(circuitPhases([create(RoutineGroupSchema)], (name) => name, 'Rest')).toEqual([])
  })
  it('ends at the prescription even when read late', () => {
    const result = buildTimeline(recording(), 900000)
    expect(result.map((entry) => entry.durationSeconds)).toEqual([120, 240])
  })

  it('excludes paused time and retains the partial last interval', () => {
    const data = recording()
    data.pauses = [{ startedAt: 61000, endedAt: 91000 }]
    data.endedAt = 181000
    expect(buildTimeline(data, 181000).map((entry) => entry.durationSeconds)).toEqual([120, 30])
  })

  it('splits a GPS edge across a boundary without losing or doubling distance', () => {
    const data = recording()
    data.points = [
      { timestamp: 120000, latitude: 0, longitude: 0, accuracy: 3 },
      { timestamp: 122000, latitude: 0, longitude: 0.0001, accuracy: 3 },
    ]
    const routes = measureRoute(data, buildTimeline(data, data.endedAt!))
    expect(routes[0].distanceMeters).toBeCloseTo(5.56, 1)
    expect(routes[1].distanceMeters).toBeCloseTo(routes[0].distanceMeters)
  })

  it('runs an open interval until the recording ends, pauses excluded', () => {
    const data = recording()
    data.phases = openSessionPhases('Bike commute', 'Bike commute', 'bike')
    data.pauses = [{ startedAt: 61000, endedAt: 91000 }]
    const [interval] = buildTimeline(data, 900000)
    expect(interval.phase.durationSeconds).toBeUndefined()
    expect(interval.durationSeconds).toBe(330)
    expect(interval.windows).toEqual([
      { start: 1000, end: 61000 },
      { start: 91000, end: 361000 },
    ])
  })

  it('measures the whole route of an open interval once it names its exercise', () => {
    const data = recording()
    data.phases = openSessionPhases('Session', 'Recording')
    data.points = [
      { timestamp: 120000, latitude: 0, longitude: 0, accuracy: 3 },
      { timestamp: 122000, latitude: 0, longitude: 0.0001, accuracy: 3 },
    ]
    // Unnamed, the interval belongs to no exercise and so measures nothing.
    expect(measureRoute(data, buildTimeline(data, data.endedAt!))[0].distanceMeters).toBe(0)

    const named = namedRecording(data, { id: 'bike', name: 'Bike commute' })
    expect(named.phases[0]).toMatchObject({ exerciseId: 'bike', name: 'Bike commute' })
    const [route] = measureRoute(named, buildTimeline(named, named.endedAt!))
    expect(route.distanceMeters).toBeCloseTo(11.12, 1)
  })

  // A circuit's intervals are already named and held against the clock; naming
  // a recording must not rewrite them.
  it('leaves timed intervals alone when a recording is named', () => {
    const data = recording()
    expect(namedRecording(data, { id: 'bike', name: 'Bike commute' }).phases).toEqual(data.phases)
  })

  it('does not draw across pauses, missing GPS, or implausible jumps', () => {
    const data = recording()
    data.pauses = [{ startedAt: 5000, endedAt: 10000 }]
    data.points = [
      { timestamp: 4000, latitude: 0, longitude: 0, accuracy: 3 },
      { timestamp: 11000, latitude: 0, longitude: 0.0001, accuracy: 3 },
      { timestamp: 12000, latitude: 0, longitude: 1, accuracy: 3 },
      { timestamp: 50000, latitude: 0, longitude: 1.0001, accuracy: 3 },
    ]
    expect(measureRoute(data, buildTimeline(data, 361000))[0].distanceMeters).toBe(0)
  })

  it('measures a walk by the speed the receiver read rather than the chord', () => {
    const data = recording()
    // Fixes that zigzag around a straight walk at 1.4 m/s: chord by chord they
    // add up to more ground than the walk covered.
    data.points = Array.from({ length: 121 }, (_, second) => ({
      ...fix(1000 + second * 1000, second * 1.4 + (second % 2 ? 1.5 : -1.5)),
      speed: 1.4,
    }))
    const walked = measureRoute(data, buildTimeline(data, 361000))[0]
    expect(walked.distanceMeters).toBeCloseTo(168, 0)
    expect(walked.incomplete).toBe(false)
  })

  it('counts a standstill the receiver saw as no distance, and still complete', () => {
    const data = recording()
    data.points = Array.from({ length: 121 }, (_, second) => ({
      ...fix(1000 + second * 1000, second % 2 ? 4 : -4),
      speed: 0,
    }))
    const stood = measureRoute(data, buildTimeline(data, 361000))[0]
    expect(stood.distanceMeters).toBe(0)
    expect(stood.incomplete).toBe(false)
  })
})

describe('edgeMeters', () => {
  it('falls back to the chord when either fix has no measured speed', () => {
    expect(edgeMeters(fix(0, 0), fix(1000, 10))).toBeCloseTo(10, 5)
    expect(edgeMeters({ ...fix(0, 0), speed: 1 }, fix(1000, 10))).toBeCloseTo(10, 5)
  })

  it('reads the mean of the two speeds over the time between them', () => {
    expect(edgeMeters({ ...fix(0, 0), speed: 1 }, { ...fix(2000, 10), speed: 2 })).toBe(3)
  })
})

describe('parseRecording', () => {
  it('reads a saved recording back', () => {
    expect(parseRecording(JSON.stringify(recording()))?.phases).toHaveLength(2)
  })

  // An older client wrote whatever it wrote; the workout around the recording
  // is still worth reading, so a broken document is simply no route.
  it('treats an absent or unreadable document as no recording', () => {
    expect(parseRecording(undefined)).toBeUndefined()
    expect(parseRecording('')).toBeUndefined()
    expect(parseRecording('{ not json')).toBeUndefined()
  })
})

describe('interval routines', () => {
  it('reads the warm-up once and the block five times, numbered straight through', () => {
    const phases = phasesOf(false)

    expect(phases).toHaveLength(11)
    expect(phases[0]).toMatchObject({ name: 'Walk', role: 'warmup', round: 1 })
    expect(phases[1]).toMatchObject({ name: 'Run', role: 'repeat', round: 1 })
    expect(phases.at(-1)).toMatchObject({ name: 'Walk', role: 'repeat', round: 5 })
    // Five rounds, whatever the warm-up in front of them is worked for.
    expect(recordedRounds({ ...recording(), phases })).toBe(5)
    expect(isIntervalRecording({ ...recording(), phases })).toBe(true)
  })

  it('ends the final round on the run when the block skips its last exercise', () => {
    const phases = phasesOf(true)

    expect(phases).toHaveLength(10)
    expect(phases.at(-1)).toMatchObject({ name: 'Run', role: 'repeat', round: 5 })
    expect(phases.filter((phase) => phase.name === 'Walk')).toHaveLength(5)
    expect(recordedRounds({ ...recording(), phases })).toBe(5)
  })

  // A walk-run walks in the warm-up and again in the block. They are two
  // stations of one session, and anything that draws or lists an interval keys
  // on the station and the round — so two of them answering to one name is a
  // segment that silently goes missing.
  it('tells two occurrences of one exercise apart', () => {
    const keys = phasesOf(false)
      .filter((phase) => phase.exerciseId)
      .map((phase) => `${phase.stationKey}-${phase.round}`)

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('leaves a gym circuit reading as its groups and its rounds', () => {
    const phases = circuitPhases(
      [
        create(RoutineGroupSchema, {
          mode: RoutineGroupMode.CIRCUIT,
          rounds: 3,
          // Nothing an interval routine says applies here, the skip included.
          skipLastOnFinalRound: true,
          exercises: [
            { exercise: { id: 'squat', name: 'Squat' }, targetDurationSeconds: 40 },
            { exercise: { id: 'row', name: 'Row' }, targetDurationSeconds: 40 },
          ],
        }),
      ],
      (name, seconds) => `${name} ${seconds}`,
      'Rest',
    )

    expect(phases).toHaveLength(6)
    expect(phases.every((phase) => phase.role === undefined)).toBe(true)
    expect(isIntervalRecording({ ...recording(), phases })).toBe(false)
    expect(recordedRounds({ ...recording(), phases })).toBe(3)
  })
})

// One degree of latitude at the equator, to the metre: a test that says how
// far apart two fixes are reads better than one that says which coordinates.
const metersPerDegree = 111194.93
const fix = (timestamp: number, meters: number, accuracy = 5): RoutePoint => ({
  timestamp,
  latitude: meters / metersPerDegree,
  longitude: 0,
  accuracy,
})

describe('currentPace', () => {
  // A minute of walking then fifteen seconds of running: the number a runner
  // acts on is the fifteen seconds, not the average that hides them.
  it('reads the trailing window rather than the whole recording', () => {
    const data = recording()
    const walked = Array.from({ length: 21 }, (_, index) => fix(index * 3000, index * 5))
    const ran = Array.from({ length: 5 }, (_, index) => fix(63000 + index * 3000, 115 + index * 15))
    data.points = [...walked, ...ran]
    expect(currentPace(data, 75000)).toBeCloseTo(200, 0)
    expect(currentPace(data, 75000, 75)).toBeCloseTo(429, 0)
  })

  it('has no pace until the window holds two accepted fixes', () => {
    const data = recording()
    expect(currentPace(data, 75000)).toBeUndefined()
    data.points = [fix(69000, 0), fix(75000, 30)]
    expect(currentPace(data, 75000)).toBeCloseTo(200, 0)
    // One fix is a position, not a speed, and an inaccurate pair is neither.
    data.points = [fix(75000, 0)]
    expect(currentPace(data, 75000)).toBeUndefined()
    data.points = [fix(69000, 0, 80), fix(75000, 30, 80)]
    expect(currentPace(data, 75000)).toBeUndefined()
  })

  // Two fixes taken while the athlete is still turning out of the drive are a
  // number that is wrong by a wide margin and then jumps, on the screen it is
  // looked at hardest.
  it('holds the pace back until the window has covered the floor', () => {
    const data = recording()
    data.points = [fix(72000, 0), fix(75000, paceFloorMeters - 1)]
    expect(currentPace(data, 75000)).toBeUndefined()

    data.points = [fix(72000, 0), fix(75000, paceFloorMeters + 1)]
    expect(currentPace(data, 75000)).toBeCloseTo(143, 0)

    // The floor is the screen's. A caller judging a reading against a target
    // rather than showing it asks for the movement as it was measured.
    data.points = [fix(72000, 0), fix(75000, paceFloorMeters - 1)]
    expect(currentPace(data, 75000, 15, 0)).toBeCloseTo(158, 0)
  })

  // The floor is the window's, not the session's: ground covered before the
  // window opened is behind the athlete, and standing still empties it again.
  it('gives the pace up again once the window drops back under the floor', () => {
    const data = recording()
    const ran = Array.from({ length: 6 }, (_, index) => fix(60000 + index * 3000, index * 10))
    data.points = ran
    expect(currentPace(data, 75000)).toBeCloseTo(300, 0)

    // Fifteen seconds standing at the crossing: the run is outside the window
    // and the two metres of wander inside it are not a pace.
    data.points = [...ran, fix(78000, 51), fix(90000, 52)]
    expect(currentPace(data, 90000)).toBeUndefined()
  })

  it('ignores movement across a pause and while standing still', () => {
    const data = recording()
    data.pauses = [{ startedAt: 66000, endedAt: 74000 }]
    data.points = [fix(65000, 0), fix(75000, 40)]
    expect(currentPace(data, 75000)).toBeUndefined()
    data.pauses = []
    data.points = [fix(72000, 10), fix(75000, 10)]
    expect(currentPace(data, 75000)).toBeUndefined()
    // Wandering fixes with a receiver that says the phone is standing.
    data.points = [
      { ...fix(72000, 0), speed: 0 },
      { ...fix(75000, 8), speed: 0 },
    ]
    expect(currentPace(data, 75000)).toBeUndefined()
  })
})
