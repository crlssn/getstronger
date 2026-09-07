import { registerPlugin } from '@capacitor/core'
import type { Pacing } from '@/utils/pacing'
import type { Phase, Recording } from '@/utils/timedCircuit'

interface TimedCircuitPlugin {
  /** `cueLeadSeconds` is the athlete's warning before an interval ends; 0 sounds nothing. */
  // The pacing is optional: a routine with no session to compare against is
  // recorded exactly as it was before there was anything to compare with.
  start(options: {
    key: string
    phases: Phase[]
    locale: string
    volume: number
    cueLeadSeconds: number
    pacing?: Pacing
  }): Promise<void>
  read(options: { key: string }): Promise<{ recording?: Recording }>
  pause(options: { key: string }): Promise<void>
  resume(options: { key: string }): Promise<void>
  finish(options: { key: string }): Promise<void>
  clear(options: { key: string }): Promise<void>
  /** How loudly the phases are announced, 0 to 1; 0 speaks nothing at all. */
  setVolume(options: { key: string; volume: number }): Promise<void>
}

// The phone's plugin owns a recording outside the WebView, which is what a
// guided circuit needs and what a browser cannot offer. A session with no set
// length is recorded on the web too, so the browser gets an implementation of
// the same seven calls; Capacitor prefers the native one wherever it exists.
export const timedCircuit = registerPlugin<TimedCircuitPlugin>('TimedCircuit', {
  web: async () => (await import('./timedCircuitWeb')).TimedCircuitWeb,
})
