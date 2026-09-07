import { metersBetween, usableFix, type RoutePoint } from '@/utils/timedCircuit'

/**
 * The stationary detector behind auto-pause.
 *
 * A recording held at a red light keeps its clock running and its distance
 * still, so a city commute reports a pace nobody rode. This reads the fixes and
 * says whether the athlete is standing or going, and the recorder holds and
 * releases the recording on the answer.
 */

export type Movement = 'still' | 'moving'

export interface MovementThresholds {
  /** Metres a second. Slower than this reads as standing still. */
  pauseSpeed: number
  /** Metres a second. Faster than this reads as going again. */
  resumeSpeed: number
  /** How long the athlete must read as standing before the recording holds. */
  dwellMs: number
}

/**
 * A gap between the two speeds rather than one line between them: a single
 * threshold would flutter the recording on and off at the pace either side of
 * it, which on a commute is most of a junction.
 */
export const movementThresholds: MovementThresholds = {
  pauseSpeed: 1000 / 3600,
  resumeSpeed: 2000 / 3600,
  dwellMs: 5000,
}

/**
 * The longest a fix may be missing before the window stops being a watch.
 *
 * Both recorders ask for a fix a second, so a hole this wide hides a movement,
 * and a signal that has gone quiet is not an athlete who has stopped.
 */
const continuousMs = 3000

const measured = (fix: RoutePoint) =>
  fix.speed !== undefined && Number.isFinite(fix.speed) && fix.speed >= 0 ? fix.speed : undefined

/**
 * How fast the window read, or nothing when it holds no evidence.
 *
 * A receiver that measures speed is believed. One that does not is judged on
 * where the athlete ended up over the whole window, less the displacement its
 * error circles already account for: a phone lying on a wall reports fixes
 * metres apart, and a speed read off that jitter never settles.
 */
const windowSpeed = (window: RoutePoint[]): number | undefined => {
  const speeds = window.map(measured).filter((speed) => speed !== undefined)
  if (speeds.length) return Math.max(...speeds)
  const first = window[0]
  const last = window.at(-1)
  if (!first || !last) return undefined
  const seconds = (last.timestamp - first.timestamp) / 1000
  if (seconds <= 0) return undefined
  return Math.max(0, metersBetween(first, last) - Math.max(first.accuracy, last.accuracy)) / seconds
}

/**
 * What the recent fixes say the athlete is doing at `at`, or nothing when they
 * say neither.
 *
 * The dwell is the window rather than a timer beside it, so `still` already
 * means "still for the whole dwell". Nothing is the common answer, and the safe
 * one: an unwatched window leaves a running recording running and a held one
 * held.
 */
export const readMovement = (
  fixes: readonly RoutePoint[],
  at: number,
  thresholds: MovementThresholds = movementThresholds,
): Movement | undefined => {
  const seen = fixes.filter((fix) => usableFix(fix) && fix.timestamp <= at)
  // The window reaches back to where the athlete was when the dwell began, so
  // it needs a fix from before that: anything shorter has not watched them
  // stand through it.
  const anchor = seen.findLast((fix) => fix.timestamp <= at - thresholds.dwellMs)
  if (!anchor) return undefined

  const window = seen.filter((fix) => fix.timestamp >= anchor.timestamp)
  const stamps = [...window.map((fix) => fix.timestamp), at]
  if (stamps.some((stamp, index) => index > 0 && stamp - stamps[index - 1] > continuousMs))
    return undefined

  const speed = windowSpeed(window)
  if (speed === undefined) return undefined
  if (speed < thresholds.pauseSpeed) return 'still'
  return speed > thresholds.resumeSpeed ? 'moving' : undefined
}
