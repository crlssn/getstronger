import { describe, expect, test } from 'vitest'

import { DistanceUnit } from '@/proto/api/v1/shared_pb'
import { callsHalfway, halfwayFloorSeconds, halfwaySaid } from './halfwayCue'

describe('callsHalfway', () => {
  const worked = { exerciseId: 'run', durationSeconds: halfwayFloorSeconds }

  test('calls the midpoint of an interval long enough to have one', () => {
    expect(callsHalfway(worked)).toBe(true)
    expect(callsHalfway({ ...worked, durationSeconds: 600 })).toBe(true)
  })

  // A rest carries no exercise, and an open interval has no end to halve.
  test('says nothing for a rest, an open interval, or one too short to halve', () => {
    expect(callsHalfway({ ...worked, exerciseId: '' })).toBe(false)
    expect(callsHalfway({ ...worked, durationSeconds: undefined })).toBe(false)
    expect(callsHalfway({ ...worked, durationSeconds: halfwayFloorSeconds - 1 })).toBe(false)
  })
})

describe('halfwaySaid', () => {
  test("fills the pace in, in the athlete's own unit", () => {
    const phrase = 'Half way. Pace {pace} per kilometre'

    expect(halfwaySaid(phrase, 300, DistanceUnit.KILOMETERS)).toBe(
      'Half way. Pace 5:00 per kilometre',
    )
    expect(halfwaySaid('Half way. Pace {pace} per mile', 300, DistanceUnit.MILES)).toBe(
      'Half way. Pace 8:03 per mile',
    )
  })
})
