import { describe, expect, it } from 'vitest'

import { movementThresholds, readMovement } from './movement'
import type { RoutePoint } from './timedCircuit'

const start = 1_000_000
// Metres along a meridian, which is what the haversine the app measures with
// answers for a change in latitude alone.
const metersPerDegree = (6371000 * Math.PI) / 180

const fix = (seconds: number, meters: number, extra: Partial<RoutePoint> = {}): RoutePoint => ({
  timestamp: start + seconds * 1000,
  latitude: meters / metersPerDegree,
  longitude: 0,
  accuracy: 5,
  ...extra,
})

/** A fix a second, each one standing where its entry says. */
const watched = (meters: number[], extra: Partial<RoutePoint> = {}) =>
  meters.map((distance, second) => fix(second, distance, extra))

const at = start + 6000

describe('the stationary detector', () => {
  it('reads a standstill as still once it has watched the dwell through', () => {
    expect(readMovement(watched([0, 0, 0, 0, 0, 0, 0]), at)).toBe('still')
  })

  it('reads a run as moving', () => {
    expect(readMovement(watched([0, 6, 12, 18, 24, 30, 36]), at)).toBe('moving')
  })

  it('sees through the drift a phone reports while it is standing still', () => {
    // Fix to fix this wanders metres a second, which is why a speed read off
    // one pair of them would keep a recording running through every red light.
    expect(readMovement(watched([0, 4, -3, 2, -4, 1, 0]), at)).toBe('still')
  })

  it('believes the speed the device measured over where its fixes landed', () => {
    // The queue outside a shop: the fixes wander a dozen metres a second and
    // the receiver still knows the phone is going nowhere.
    expect(readMovement(watched([0, 12, -12, 12, -12, 12, 0], { speed: 0 }), at)).toBe('still')
  })

  it('waits out the whole dwell before a standstill reads as one', () => {
    const stopping = [0, 6, 12, 18, 24, 24, 24, 24, 24, 24]
    // Four seconds in it is a run that has only just stopped.
    expect(readMovement(watched(stopping), start + 4000)).toBe('moving')
    expect(readMovement(watched(stopping), at)).toBe('still')
  })

  it('reads a stop within three seconds of the receiver seeing it', () => {
    // The speed a receiver reports falls over a second or so after the
    // athlete stops: a fix reading fast, one reading slow, then still.
    const speeds = [1.4, 1.4, 1.4, 1.4, 0.9, 0.3, 0.1, 0]
    const fixes = speeds.map((speed, second) => fix(second, 0, { speed }))
    expect(readMovement(fixes, start + 6000)).toBe('moving')
    expect(readMovement(fixes, start + 7000)).toBe('still')
  })

  it('says nothing between the two thresholds', () => {
    const dawdling = watched([0, 0, 0, 0, 0, 0, 0], { speed: 0.7 })
    expect(readMovement(dawdling, at)).toBeUndefined()
  })

  it('says nothing until the dwell has fixes on both sides of it', () => {
    expect(readMovement(watched([0, 0]), start + 1000)).toBeUndefined()
  })

  it('says nothing once the fixes have stopped arriving', () => {
    // A lost signal is not a stopped athlete.
    expect(readMovement(watched([0, 0, 0]), at)).toBeUndefined()
  })

  it('says nothing when a hole interrupts the window', () => {
    expect(readMovement([fix(0, 0), fix(1, 0), fix(6, 0)], at)).toBeUndefined()
  })

  it('drops a fix too inaccurate to place, and keeps reading the rest', () => {
    const fixes = watched([0, 0, 0, 0, 0, 0, 0])
    fixes[4] = fix(4, 400, { accuracy: 400 })
    expect(readMovement(fixes, at)).toBe('still')

    const allVague = fixes.map((point) => ({ ...point, accuracy: 400 }))
    expect(readMovement(allVague, at)).toBeUndefined()
  })

  it('holds to the thresholds the athlete was promised', () => {
    expect(movementThresholds.pauseSpeed * 3.6).toBeCloseTo(2)
    expect(movementThresholds.resumeSpeed * 3.6).toBeCloseTo(3)
    expect(movementThresholds.dwellMs).toBe(2000)
  })
})
