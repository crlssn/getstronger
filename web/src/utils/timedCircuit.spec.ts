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
  smoothRoute,
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
      { timestamp: 120000, latitude: 0, longitude: 0, accuracy: 0 },
      { timestamp: 122000, latitude: 0, longitude: 0.0001, accuracy: 0 },
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
      { timestamp: 120000, latitude: 0, longitude: 0, accuracy: 0 },
      { timestamp: 122000, latitude: 0, longitude: 0.0001, accuracy: 0 },
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

  it('drops an edge that spans a pause the athlete held by hand', () => {
    const data = recording()
    data.pauses = [{ startedAt: 5000, endedAt: 10000 }]
    data.points = [fix(4000, 0, 3), fix(11000, 10, 3)]
    const [walk] = measureRoute(data, buildTimeline(data, 361000))
    // The athlete may have wandered off while held: the ground is not theirs.
    expect(walk.distanceMeters).toBe(0)
    expect(walk.incomplete).toBe(true)
  })

  // The detector holds a recording where the athlete stopped and lets it go
  // once they are moving again, so the edge across its pause is the standing
  // plus the first strides out of it: ground that belongs to the interval the
  // hold interrupted, laid down in one piece.
  it('credits the edge across an auto-pause and lays it down unbroken', () => {
    const data = recording()
    data.phases = [{ ...data.phases[0], durationSeconds: 10 }]
    data.pauses = [{ startedAt: 5000, endedAt: 10000, auto: true }]
    // Standing at the crossing, then ten metres between the last fix before
    // the hold and the first after it.
    data.points = [
      ...[1000, 2000, 3000, 4000].map((timestamp) => fix(timestamp, 0)),
      ...[11000, 12000, 13000, 14000, 15000, 16000].map((timestamp) => fix(timestamp, 10)),
    ]
    const [walk] = measureRoute(data, buildTimeline(data, 361000))
    expect(walk.distanceMeters).toBeCloseTo(10, 5)
    expect(walk.incomplete).toBe(false)
    // One segment carries the whole chord, from the last fix before the hold
    // to the first after it, rather than stopping at the pause and resuming.
    const across = walk.segments.find(([, b]) => b.timestamp === 11000)
    expect(across?.[0].timestamp).toBe(4000)
    expect(across?.[1].latitude).toBeCloseTo(10 / metersPerDegree, 10)
  })

  // The recorder keeps recording through a hold it opened itself, so the route
  // runs on under it. A hold that read a creep as a standstill must not cost
  // the athlete that ground, and must not break the line drawn through it.
  it('credits the ground covered under an auto-pause and draws it unbroken', () => {
    const data = recording()
    data.phases = [{ ...data.phases[0], durationSeconds: 10 }]
    // Backdated behind the last fix before it, as the detector records it.
    data.pauses = [{ startedAt: 4500, endedAt: 11000, auto: true }]
    data.points = [
      ...[1000, 2000, 3000, 4000].map((timestamp) => fix(timestamp, 0)),
      // Twenty metres crept under the hold, five at a time.
      ...[6000, 8000, 10000].map((timestamp) => fix(timestamp, (timestamp - 4000) / 300)),
      ...[11000, 12000].map((timestamp) => fix(timestamp, 20 + (timestamp - 11000) / 100)),
    ]
    const [walk] = measureRoute(data, buildTimeline(data, 361000))
    // Twenty metres under the hold and ten after it.
    expect(walk.distanceMeters).toBeCloseTo(30, 5)
    expect(walk.incomplete).toBe(false)
    // The hold stops the clock: the interval spans 16.5 seconds of wall clock
    // and takes only the 10 the athlete was not held for.
    expect(walk.durationSeconds).toBeCloseTo(10, 5)
    // One unbroken run: every segment starts where the last one ended.
    const breaks = walk.segments.filter(
      ([a], index) => index > 0 && a.timestamp !== walk.segments[index - 1][1].timestamp,
    )
    expect(breaks).toEqual([])
  })

  it('drops an implausible jump and reads the interval as incomplete', () => {
    const data = recording()
    data.points = [fix(12000, 0, 0), fix(13000, 100000, 0), fix(50000, 100010, 0)]
    const [walk] = measureRoute(data, buildTimeline(data, 361000))
    expect(walk.distanceMeters).toBeCloseTo(10, 5)
    expect(walk.incomplete).toBe(true)
  })

  // A phone in a pocket under trees reports fixes too vague to place for a
  // stretch, then finds the sky again. A watch bridges the hole; dropping it
  // is the distance this app used to lose.
  it('bridges a stretch of fixes too vague to place', () => {
    const data = recording()
    data.phases = [{ ...data.phases[0], durationSeconds: 10 }]
    // Three metres a second, with two fixes mid-way that could be anywhere.
    data.points = Array.from({ length: 11 }, (_, second) =>
      second === 5 || second === 6
        ? fix(1000 + second * 1000, 40, 80)
        : fix(1000 + second * 1000, second * 3),
    )
    const [walk] = measureRoute(data, buildTimeline(data, 361000))
    expect(walk.distanceMeters).toBeCloseTo(30, 5)
    expect(walk.incomplete).toBe(false)
    expect(walk.segments).toHaveLength(8)
  })

  it('bridges a hole in the fixes by the chord across it', () => {
    const data = recording()
    data.phases = [{ ...data.phases[0], durationSeconds: 62 }]
    // A minute in a tunnel: the straight line is the least the athlete ran.
    data.points = [fix(1000, 0), fix(2000, 3), fix(62000, 183), fix(63000, 186)]
    const [walk] = measureRoute(data, buildTimeline(data, 361000))
    expect(walk.distanceMeters).toBeCloseTo(186, 2)
    expect(walk.incomplete).toBe(false)
  })

  it('reads a jittering walk close to the ground it covered', () => {
    const data = recording()
    // Fixes that zigzag around a straight walk at 1.4 m/s: chord by chord they
    // add up to far more ground than the walk covered.
    data.points = Array.from({ length: 121 }, (_, second) =>
      fix(1000 + second * 1000, second * 1.4 + (second % 2 ? 1.5 : -1.5), 8),
    )
    const walked = measureRoute(data, buildTimeline(data, 361000))[0]
    expect(walked.distanceMeters).toBeGreaterThan(168 * 0.95)
    expect(walked.distanceMeters).toBeLessThan(168 * 1.1)
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

  // A pace target is a distance over a time, and a live pace is read from
  // the same fixes: both have to see the run the saved route sees.
  it('measures the live pace and the saved route from the same smoothed fixes', () => {
    const data = recording()
    data.points = Array.from({ length: 16 }, (_, second) =>
      fix(60000 + second * 1000, second * 3 + (second % 2 ? 1 : -1), 8),
    )
    const [walk] = measureRoute(data, buildTimeline(data, 361000))
    const meters = walk.distanceMeters
    expect(currentPace(data, 75000)).toBeCloseTo((15 / meters) * 1000, 5)
  })
})

describe('smoothRoute', () => {
  it('believes a precise fix and leans on the estimate when a fix is vague', () => {
    const [, precise] = smoothRoute([fix(0, 0, 0), fix(1000, 10, 0)])
    expect(precise.latitude).toBeCloseTo(10 / metersPerDegree, 10)
    const [, vague] = smoothRoute([fix(0, 0, 0), fix(1000, 10, 30)])
    const meters = vague.latitude * metersPerDegree
    expect(meters).toBeGreaterThan(0)
    expect(meters).toBeLessThan(2)
    // A fix the filter has not seen for a long while is trusted again: the
    // athlete could have gone anywhere in a minute.
    const [, later] = smoothRoute([fix(0, 0, 0), fix(60000, 100, 10)])
    expect(later.latitude * metersPerDegree).toBeGreaterThan(80)
  })

  it('keeps every field of a fix but its position, and drops the unusable', () => {
    const points = [
      { ...fix(0, 0, 4), speed: 2 },
      fix(1000, 3, 80),
      { ...fix(2000, 6, 4), speed: 2.5 },
    ]
    const smoothed = smoothRoute(points)
    expect(smoothed).toHaveLength(2)
    expect(smoothed[1]).toMatchObject({ timestamp: 2000, accuracy: 4, speed: 2.5 })
  })

  it('takes the short way round the date line', () => {
    const [, second] = smoothRoute([
      { timestamp: 0, latitude: 0, longitude: 179.9999, accuracy: 5 },
      { timestamp: 1000, latitude: 0, longitude: -179.9999, accuracy: 5 },
    ])
    expect(Math.abs(second.longitude)).toBeGreaterThan(179.99)
  })
})

describe('edgeMeters', () => {
  it('is the chord between two fixes', () => {
    expect(edgeMeters(fix(0, 0), fix(1000, 10))).toBeCloseTo(10, 5)
    expect(edgeMeters({ ...fix(0, 0), speed: 1 }, fix(1000, 10))).toBeCloseTo(10, 5)
  })

  it('is nothing while the receiver read the phone as standing at both ends', () => {
    expect(edgeMeters({ ...fix(0, 0), speed: 0.1 }, { ...fix(1000, 10), speed: 0.2 })).toBe(0)
    expect(edgeMeters({ ...fix(0, 0), speed: 0.1 }, { ...fix(1000, 10), speed: 1 })).toBeCloseTo(
      10,
      5,
    )
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
    // A block outside an interval routine has no place in one, so the session
    // reads as its groups and rounds rather than as a numbered sequence.
    expect(phases.every((phase) => phase.role === undefined)).toBe(true)
    expect(isIntervalRecording({ ...recording(), phases })).toBe(false)
    expect(recordedRounds({ ...recording(), phases })).toBe(3)
  })

  // A gym circuit ends its final round early for the same reason a walk-run
  // does: nobody comes for the last station.
  it('ends a circuit an exercise early wherever it says to', () => {
    const phases = circuitPhases(
      [
        create(RoutineGroupSchema, {
          mode: RoutineGroupMode.CIRCUIT,
          rounds: 3,
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

    expect(phases).toHaveLength(5)
    expect(phases.at(-1)?.name).toBe('Squat')
  })

  // A warm-up is worked once through, which is a straight block. Guiding it is
  // the same work as guiding a circuit that goes round once, so a routine whose
  // parts are not all circuits is still a session the clock can run.
  it('guides a straight block as the one round it is worked for', () => {
    const phases = circuitPhases(
      [
        create(RoutineGroupSchema, {
          mode: RoutineGroupMode.STRAIGHT,
          role: RoutineGroupRole.WARMUP,
          exercises: [{ exercise: { id: 'walk', name: 'Walk' }, targetDurationSeconds: 60 }],
        }),
        create(RoutineGroupSchema, {
          mode: RoutineGroupMode.CIRCUIT,
          rounds: 2,
          role: RoutineGroupRole.REPEAT,
          exercises: [{ exercise: { id: 'run', name: 'Run' }, targetDurationSeconds: 30 }],
        }),
      ],
      (name, seconds) => `${name} ${seconds}`,
      'Rest',
    )

    expect(phases.map((phase) => phase.name)).toEqual(['Walk', 'Run', 'Run'])
    expect(phases.map((phase) => phase.round)).toEqual([1, 1, 2])
    // The count is the repeating block's: a warm-up is worked outside it.
    expect(recordedRounds({ ...recording(), phases })).toBe(2)
  })

  // An open-ended circuit has no prescribed length, so there is no session for
  // the clock to run through.
  it('builds nothing from a circuit with no round count', () => {
    expect(
      circuitPhases(
        [
          create(RoutineGroupSchema, {
            mode: RoutineGroupMode.CIRCUIT,
            rounds: 0,
            exercises: [{ exercise: { id: 'row', name: 'Row' }, targetDurationSeconds: 40 }],
          }),
        ],
        (name, seconds) => `${name} ${seconds}`,
        'Rest',
      ),
    ).toEqual([])
  })
})

// One degree of latitude at the equator, to the metre: a test that says how
// far apart two fixes are reads better than one that says which coordinates.
const metersPerDegree = 111194.93
// Exact fixes by default: a test about time and attribution is not one about
// what the smoothing makes of a five-metre error circle.
const fix = (timestamp: number, meters: number, accuracy = 0): RoutePoint => ({
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
