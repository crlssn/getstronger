import { describe, expect, it } from 'vitest'

import {
  newPaceWatch,
  paceMinimumGapSeconds,
  paceTargets,
  paceToleranceSeconds,
  paceWindowSeconds,
  pacingFor,
  watchPace,
  type PaceWatch,
  type Pacing,
} from './pacing'
import type { Phase, Recording } from './timedCircuit'

const phase = (stationKey: string, round: number, durationSeconds: number): Phase => ({
  exerciseId: stationKey === 'rest' ? '' : stationKey,
  stationKey,
  name: stationKey,
  round,
  durationSeconds,
  instruction: stationKey,
})

/** A degree of longitude at the equator, on the sphere the route is measured on. */
const metreDegrees = 180 / (6371000 * Math.PI)

/**
 * A reference session of two intervals, each straight east from the same
 * point. The run covers twice the ground of the walk in the same time, so
 * their paces cannot be confused for one another.
 */
const reference = (): Recording => {
  const startedAt = 1000
  const phases = [phase('walk', 1, 60), phase('run', 1, 60)]
  // Two and a half metres a second for the walk, five for the run: 400 and
  // 200 seconds per kilometre, both inside what a fix is accepted at.
  const metres = (index: number) => (index <= 12 ? index * 12.5 : 150 + (index - 12) * 25)
  const points = Array.from({ length: 25 }, (_, index) => ({
    timestamp: startedAt + index * 5000,
    latitude: 0,
    longitude: metres(index) * metreDegrees,
    accuracy: 5,
  }))
  return {
    version: 1,
    startedAt,
    endedAt: startedAt + 120000,
    phases,
    pauses: [],
    points,
    interrupted: false,
  }
}

describe('pace targets', () => {
  it('holds each interval to what the reference session did on the same station and round', () => {
    const targets = paceTargets(reference().phases, reference())
    expect(targets).toHaveLength(2)
    expect(targets[0]).toBeCloseTo(400, 0)
    expect(targets[1]).toBeCloseTo(200, 0)
  })

  it('leaves an interval the reference never worked without a target', () => {
    const targets = paceTargets(
      [phase('walk', 1, 60), phase('run', 1, 60), phase('run', 2, 60), phase('rest', 2, 30)],
      reference(),
    )
    expect(targets[2]).toBe(0)
    expect(targets[3]).toBe(0)
  })

  it('has nothing to say without a reference, or before one has ended', () => {
    const unfinished = { ...reference(), endedAt: undefined }
    expect(paceTargets(reference().phases)).toEqual([0, 0])
    expect(paceTargets(reference().phases, unfinished)).toEqual([0, 0])
  })

  it('ignores a reference whose fixes have gaps in them', () => {
    // A distance the GPS missed reads as a slower pace, so an interrupted
    // session is not a pace to chase.
    expect(paceTargets(reference().phases, { ...reference(), interrupted: true })).toEqual([0, 0])
  })

  it('carries the tuning knobs with the targets', () => {
    const pacing = pacingFor(reference().phases, reference())
    expect(pacing.toleranceSeconds).toBe(paceToleranceSeconds)
    expect(pacing.minimumGapSeconds).toBe(paceMinimumGapSeconds)
    expect(pacing.windowSeconds).toBe(paceWindowSeconds)
  })
})

describe('watching the pace', () => {
  const pacing: Pacing = {
    targets: [300, 300],
    toleranceSeconds: 10,
    minimumGapSeconds: 30,
    windowSeconds: 15,
  }
  const read = (
    watch: PaceWatch,
    pace: number | undefined,
    at: number,
    phaseIndex = 0,
    phaseSeconds = 20,
  ) => watchPace(watch, { phaseIndex, phaseSeconds, pace, at }, pacing)

  it('says nothing while the pace holds the band', () => {
    const inside = read(newPaceWatch(), 305, 20000)
    expect(inside.tone).toBeUndefined()
    expect(read(inside.watch, 291, 40000).tone).toBeUndefined()
  })

  it('sounds once when the pace pulls ahead, and again only after it comes back', () => {
    const ahead = read(newPaceWatch(), 280, 20000)
    expect(ahead.tone).toBe('ahead')

    // Still ahead a minute later, which is the same crossing.
    const held = read(ahead.watch, 275, 80000)
    expect(held.tone).toBeUndefined()

    const back = read(held.watch, 300, 100000)
    expect(back.tone).toBeUndefined()
    expect(read(back.watch, 280, 140000).tone).toBe('ahead')
  })

  it('sounds the other way when the pace falls behind', () => {
    expect(read(newPaceWatch(), 320, 20000).tone).toBe('behind')
  })

  it('holds a tone back until the gap has passed, and plays it late', () => {
    const ahead = read(newPaceWatch(), 280, 20000)
    const swallowed = read(ahead.watch, 320, 30000)
    expect(swallowed.tone).toBeUndefined()
    // The crossing is still pending, so it is heard once the gap allows it.
    expect(read(swallowed.watch, 320, 51000).tone).toBe('behind')
  })

  it('waits out the trailing window before judging an interval', () => {
    // The window still holds the interval before this one.
    const early = read(newPaceWatch(), 280, 20000, 0, 14)
    expect(early.tone).toBeUndefined()
    expect(early.watch.zone).toBeUndefined()
  })

  it('starts each interval afresh', () => {
    const ahead = read(newPaceWatch(), 280, 20000)
    expect(ahead.tone).toBe('ahead')
    // The next interval is a crossing of its own, once the gap has passed.
    expect(read(ahead.watch, 280, 60000, 1).tone).toBe('ahead')
  })

  it('says nothing without a target or without a pace', () => {
    expect(
      watchPace(newPaceWatch(), { phaseIndex: 5, phaseSeconds: 60, pace: 200, at: 1 }, pacing).tone,
    ).toBeUndefined()
    expect(read(newPaceWatch(), undefined, 20000).tone).toBeUndefined()
    expect(
      watchPace(
        newPaceWatch(),
        { phaseIndex: 0, phaseSeconds: 60, pace: 100, at: 1 },
        { ...pacing, targets: [0, 0] },
      ).tone,
    ).toBeUndefined()
  })
})
