/**
 * The tone that warns an interval is about to end.
 *
 * An interval used to end with the next instruction and nothing before it, so
 * a runner had no way to prepare to change pace — least of all with the phone
 * locked, where the screen says nothing. The lead time is the athlete's, and
 * the three recorders — iOS, Android and the browser — read it the same way.
 */

/** How many seconds before the end the cue sounds; 0 turns it off. */
export const cueLeads = [0, 5, 10, 15, 20]

export const defaultCueLead = 10

export const normalizeCueLead = (seconds?: number): number =>
  seconds !== undefined && cueLeads.includes(seconds) ? seconds : defaultCueLead

/**
 * Whether an interval is long enough to be worth warning about.
 *
 * A cue at or before the midpoint is a second instruction rather than a
 * warning, so anything shorter than twice the lead runs out unannounced.
 */
export const cuesInterval = (durationSeconds: number | undefined, leadSeconds: number): boolean =>
  leadSeconds > 0 && durationSeconds !== undefined && durationSeconds >= leadSeconds * 2
