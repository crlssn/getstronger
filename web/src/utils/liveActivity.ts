import type { TFunction } from 'i18next'

/** What the iOS Lock Screen shows beside a session, in the athlete's language. */
export interface LiveActivityLabels {
  paused: string
  intervalLeft: string
  total: string
  pace: string
  /** Shown once the app has stopped keeping the session. */
  stopped: string
  /** The route a tap on the Lock Screen opens. */
  path: string
}

/**
 * The words and the way back a recording hands the phone as it starts.
 *
 * The Lock Screen has no message catalogue, so every word crosses the bridge
 * already translated, and a tap lands on the screen the session is recorded on.
 */
export const liveActivityLabels = (t: TFunction, path: string): LiveActivityLabels => ({
  paused: t('timedCircuit.pausedLabel'),
  intervalLeft: t('timedCircuit.intervalLeft'),
  total: t('timedCircuit.activeTime'),
  pace: t('timedCircuit.paceNow'),
  stopped: t('timedCircuit.liveStopped'),
  path,
})
