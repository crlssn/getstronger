import { describe, expect, it } from 'vitest'
import { create } from '@bufbuild/protobuf'
import { RoutineGroupSchema } from '@/proto/api/v1/routine_service_pb'
import { RoutineGroupMode } from '@/proto/api/v1/shared_pb'
import {
  buildTimeline,
  circuitPhases,
  measureRoute,
  parseRecording,
  type Recording,
} from './timedCircuit'

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
    expect(phases.reduce((sum, phase) => sum + phase.durationSeconds, 0)).toBe(2160)
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
