import { registerPlugin } from '@capacitor/core'
import type { Pacing } from '@/utils/pacing'
import type { Phase, Recording } from '@/utils/timedCircuit'

interface TimedCircuitPlugin {
  /** `cueLeadSeconds` is the athlete's warning before an interval ends; 0 says nothing. */
  // The pacing is optional: a routine with no session to compare against is
  // recorded exactly as it was before there was anything to compare with.
  start(options: {
    key: string
    phases: Phase[]
    locale: string
    volume: number
    cueLeadSeconds: number
    /** The warning, spoken: the seconds left, already in the athlete's language. */
    cuePhrase: string
    /**
     * Said at the midpoint of an interval, with `{pace}` left for the recorder
     * to fill in from what it has measured. Empty says nothing.
     */
    halfwayPhrase: string
    /** The unit that pace is per, `km` or `mi`. */
    distanceUnit: string
    /** Said once the last interval runs out; ending a session by hand says nothing. */
    completedPhrase: string
    pacing?: Pacing
    /** Whether the recorder holds itself while the athlete is standing still. */
    autoPause: boolean
  }): Promise<void>
  read(options: { key: string }): Promise<{ recording?: Recording }>
  pause(options: { key: string }): Promise<void>
  resume(options: { key: string }): Promise<void>
  finish(options: { key: string }): Promise<void>
  clear(options: { key: string }): Promise<void>
  /** How loudly the phases are announced, 0 to 1; 0 speaks nothing at all. */
  setVolume(options: { key: string; volume: number }): Promise<void>
  /**
   * Says one phrase in the best voice the device has, outside any recording.
   *
   * The settings screens play an example of what a run will sound like, and
   * only the recorder knew which voice that is: a WebView is handed none of
   * the voices the phone has installed — iOS offers the web API an empty list
   * — so an example said by the page was never the voice being chosen.
   */
  speak(options: { phrase: string; volume: number; locale: string }): Promise<void>
}

// The phone's plugin owns a recording outside the WebView, which is what a
// guided circuit needs and what a browser cannot offer. A session with no set
// length is recorded on the web too, so the browser gets an implementation of
// the same seven calls; Capacitor prefers the native one wherever it exists.
export const timedCircuit = registerPlugin<TimedCircuitPlugin>('TimedCircuit', {
  web: async () => (await import('./timedCircuitWeb')).TimedCircuitWeb,
})
