import { describe, expect, test } from 'vitest'

import { DistanceUnit } from '@/proto/api/v1/shared_pb'
import { callsHalfway, halfwayFloorSeconds, halfwaySaid, spokenPace } from './halfwayCue'

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

describe('spokenPace', () => {
  const words = { minute: 'minute', minutes: 'minutes', second: 'second', seconds: 'seconds' }

  // A synthesiser reads "5:00" as a time, and said it out as "five o'clock":
  // a pace is a duration, and the app already spells durations out.
  test('spells a pace out rather than punctuating it', () => {
    expect(spokenPace(300, words, DistanceUnit.KILOMETERS)).toBe('5 minutes')
    expect(spokenPace(330, words, DistanceUnit.KILOMETERS)).toBe('5 minutes 30 seconds')
    expect(spokenPace(61, words, DistanceUnit.KILOMETERS)).toBe('1 minute 1 second')
  })

  // Under a minute a kilometre is nobody's running pace, but a rounding that
  // says "0 minutes" would be read out as one.
  test('drops a part that has nothing to say', () => {
    expect(spokenPace(45, words, DistanceUnit.KILOMETERS)).toBe('45 seconds')
    expect(spokenPace(0.4, words, DistanceUnit.KILOMETERS)).toBe('0 seconds')
  })

  test("converts to the athlete's own unit first", () => {
    expect(spokenPace(300, words, DistanceUnit.MILES)).toBe('8 minutes 3 seconds')
  })
})

describe('halfwaySaid', () => {
  test("fills the pace in, spelled out, in the athlete's own unit", () => {
    const words = { minute: 'minute', minutes: 'minutes', second: 'second', seconds: 'seconds' }

    expect(halfwaySaid('Half way. {pace} per kilometre', 300, words, DistanceUnit.KILOMETERS)).toBe(
      'Half way. 5 minutes per kilometre',
    )
    expect(halfwaySaid('Half way. {pace} per mile', 300, words, DistanceUnit.MILES)).toBe(
      'Half way. 8 minutes 3 seconds per mile',
    )
  })
})
