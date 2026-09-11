/**
 * The call at the midpoint of an interval, with the pace held so far.
 *
 * Inside an interval a recording says nothing between the instruction and the
 * warning that it is ending, so on a five-minute rep the athlete has no way of
 * knowing whether the pace they are holding is the one they meant — least of
 * all with the phone in a pocket. The pace tones only say faster or slower
 * than a reference session, and only where there is one.
 *
 * The pace is known at the time and nowhere else, so the recorders are handed
 * a phrase with a hole in it and fill the hole themselves. All three do:
 * `native/timedCircuitWeb.ts`, `TimedCircuitPlugin.swift` and
 * `TimedCircuitService.java`.
 */

import type { TFunction } from 'i18next'

import { DistanceUnit } from '@/proto/api/v1/shared_pb'

import { kilometersPerMile, normalizeDistanceUnit } from '@/utils/distanceUnits'
import type { Phase } from '@/utils/timedCircuit'

/**
 * The bare words a spoken pace is built from, in the athlete's language.
 *
 * Handed to the recorders rather than looked up by them: the phones have no
 * message catalogue, and a pace read out in the wrong language is worse than
 * none. @public
 */
export interface PaceWords {
  minute: string
  minutes: string
  second: string
  seconds: string
}

/**
 * The token every recorder replaces with the pace it measured.
 *
 * Spelled out again in `TimedCircuitPlugin.swift` and `TimedCircuitService.java`:
 * the phones never see this file, and a phrase is no use to them without it.
 */
const pacePlaceholder = '{pace}'

/**
 * The shortest interval with a midpoint worth naming, in seconds.
 *
 * The call takes a couple of seconds to say, and on anything shorter it lands
 * close enough to the instruction or to the end-of-interval warning to be
 * heard as one of them.
 */
export const halfwayFloorSeconds = 60

/**
 * The pace the settings row says the call at, in seconds per kilometre.
 *
 * Round enough that nobody mistakes the example for something measured, and
 * close enough to a run to be recognised as a pace.
 */
export const examplePaceSeconds = 300

/**
 * Whether an interval earns a call at its midpoint.
 *
 * A rest is named by the recording but is not worked, so halving it says
 * nothing; an open interval has no midpoint to find.
 */
export const callsHalfway = (phase: Pick<Phase, 'exerciseId' | 'durationSeconds'>): boolean =>
  phase.exerciseId !== '' && (phase.durationSeconds ?? 0) >= halfwayFloorSeconds

/**
 * The phrase to hand a recorder, with the hole for the pace still in it.
 *
 * The unit the pace is per is part of the sentence rather than appended to it,
 * so it is a word each locale writes rather than a label bolted on.
 */
export const halfwayPhrase = (t: TFunction, unit?: DistanceUnit): string =>
  t(
    normalizeDistanceUnit(unit) === DistanceUnit.MILES
      ? 'timedCircuit.halfwayMile'
      : 'timedCircuit.halfwayKilometre',
    // Passed through rather than left to the catalogue's own interpolation:
    // what comes back has to still carry the token for the recorder to find.
    { pace: pacePlaceholder },
  )

/**
 * A pace spelled out, in the athlete's unit: "5 minutes 30 seconds".
 *
 * Not "5:30". A synthesiser reads a colon as a time and says "five thirty" at
 * best and "five o'clock" at worst, which is what a round pace came out as.
 * The app already spells durations out for the same reason — see
 * `spokenDuration` — and the phones build this same string from the same
 * words, in `TimedCircuitPlugin.swift` and `TimedCircuitService.java`.
 */
export const spokenPace = (
  secondsPerKilometer: number,
  words: PaceWords,
  unit?: DistanceUnit,
): string => {
  const perUnit = Math.round(
    normalizeDistanceUnit(unit) === DistanceUnit.MILES
      ? secondsPerKilometer * kilometersPerMile
      : secondsPerKilometer,
  )
  const minutes = Math.floor(perUnit / 60)
  const seconds = perUnit % 60
  const said = [
    ...(minutes > 0 ? [`${minutes} ${minutes === 1 ? words.minute : words.minutes}`] : []),
    ...(seconds > 0 ? [`${seconds} ${seconds === 1 ? words.second : words.seconds}`] : []),
  ]
  // A pace that rounds to nothing is nobody's, but "0 minutes" read out is
  // worse than a figure that says what it is.
  return said.length > 0 ? said.join(' ') : `0 ${words.seconds}`
}

/** The words a recorder is handed, so it says a pace in the athlete's language. */
export const paceWords = (t: TFunction): PaceWords => ({
  minute: t('timedCircuit.paceMinute'),
  minutes: t('timedCircuit.paceMinutes'),
  second: t('timedCircuit.paceSecond'),
  seconds: t('timedCircuit.paceSeconds'),
})

/** The phrase as it is said: the pace spelled out, in the athlete's unit. */
export const halfwaySaid = (
  phrase: string,
  secondsPerKilometer: number,
  words: PaceWords,
  unit?: DistanceUnit,
): string => phrase.replace(pacePlaceholder, spokenPace(secondsPerKilometer, words, unit))
