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

import { normalizeDistanceUnit } from '@/utils/distanceUnits'
import { paceIn } from '@/utils/exerciseMeasurements'
import type { Phase } from '@/utils/timedCircuit'

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

/** The phrase as it is said: the pace filled in, in the athlete's unit. */
export const halfwaySaid = (
  phrase: string,
  secondsPerKilometer: number,
  unit?: DistanceUnit,
): string => phrase.replace(pacePlaceholder, paceIn(secondsPerKilometer, unit).value)
