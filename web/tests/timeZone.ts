/**
 * The zone every unit test runs in.
 *
 * Pinned because the app reads the reader's clock — `DateTime.now().hour`
 * greets, and a day's sessions group by local date — so a spec that fixes an
 * instant and asserts what it looks like is asserting about a zone whether it
 * says so or not. Left to the machine, that zone was CI's: the suite passed in
 * UTC and failed east of UTC+2.
 *
 * Deliberately not UTC. Under UTC local and UTC agree, so a component that
 * read the wrong one of the two would pass every test ever written here. This
 * zone has a half-hour offset and no daylight saving: far enough from UTC to
 * keep that mistake visible, fixed enough that an instant always means the
 * same wall clock.
 *
 * Moving it moves every day boundary the fixtures sit near, so a spec that
 * fixes noon UTC and expects one bar for that day is a spec this constant can
 * break. `time-zone.spec.ts` holds it to what those fixtures rely on.
 */
export const suiteTimeZone = 'Asia/Colombo'
