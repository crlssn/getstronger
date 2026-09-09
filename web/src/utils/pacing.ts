import { PaceReference } from '@/proto/api/v1/workout_service_pb'
import { buildTimeline, measureRoute, type Phase, type Recording } from '@/utils/timedCircuit'

/**
 * Which recorded session a new one is held against, or none at all.
 *
 * Kept as the words the API uses rather than the enum, so the stored
 * preference reads the same in the console as it does in the request. Off is
 * a session with nothing to compare against, which no recorder sounds.
 */
export type PaceReferenceChoice = 'off' | 'previous' | 'best'

/** The choices in the order the settings screen offers them: off first. */
export const paceReferenceChoices: PaceReferenceChoice[] = ['off', 'previous', 'best']

/** The name of each choice, as the settings row and screen show it. */
export const paceToneLabelKey: Record<PaceReferenceChoice, string> = {
  off: 'settings.paceTonesOff',
  previous: 'settings.paceTonesPrevious',
  best: 'settings.paceTonesBest',
}

/** The stored choice as the request states it. */
export const paceReferenceRequested = (choice: PaceReferenceChoice): PaceReference =>
  choice === 'best' ? PaceReference.BEST : PaceReference.PREVIOUS

/** A pace read as better than the reference, or as worse than it. */
export type PaceTone = 'ahead' | 'behind'

/**
 * The reference a recording is paced against, as the recorder needs it.
 *
 * The plugin owns the comparison because the phone is in a pocket with the
 * screen locked, where the WebView is asleep and only the recorder is awake.
 * Everything it needs to decide is settled here and handed over at the start:
 * the target for each interval, and the three numbers that say when a
 * difference is worth hearing.
 */
export interface Pacing {
  /**
   * Seconds per kilometre to hold each interval to, by its position in the
   * prescription. Zero where the reference session has nothing to say about
   * it — a rest, an interval it never worked, or one it measured no distance
   * over.
   */
  targets: number[]
  /** How far either side of the target still counts as holding it. */
  toleranceSeconds: number
  /** The shortest time between two tones. */
  minimumGapSeconds: number
  /** The trailing window the pace now is read over. */
  windowSeconds: number
}

/**
 * A band of ten seconds per kilometre either side of the reference: about
 * three per cent at a 5:20 pace, which is wider than the wobble a GPS fix
 * carries and narrower than a difference worth telling an athlete about.
 *
 * This and the two below are the recording's tuning knobs, kept together
 * because they are read together: widening the band and lengthening the gap
 * are the same decision made twice.
 */
export const paceToleranceSeconds = 10

/**
 * At most one tone every half minute. A pace sitting on the edge of the band
 * crosses it on almost every fix, and a phone chirping through an interval is
 * worse than one that says nothing.
 */
export const paceMinimumGapSeconds = 30

/**
 * The trailing window the pace now is read over, which is the window the
 * recording screen shows. It is also how long an interval runs before it is
 * judged: any shorter and the window still holds the interval before it.
 */
export const paceWindowSeconds = 15

const intervalKey = (phase: Phase) => `${phase.stationKey}:${phase.round}`

/**
 * What the reference session held each of this session's intervals to.
 *
 * Matched by station and round, the key the prescription is built on, so a
 * routine that has since gained an interval keeps the targets for the ones it
 * already had. An interval the reference measured with gaps in it is left
 * without a target: a distance the GPS missed reads as a slower pace, and
 * chasing it is chasing nothing.
 */
export const paceTargets = (phases: readonly Phase[], reference?: Recording): number[] => {
  const measured = new Map<string, number>()
  if (reference?.endedAt) {
    for (const interval of measureRoute(reference, buildTimeline(reference, reference.endedAt))) {
      if (interval.incomplete || interval.distanceMeters <= 0 || interval.durationSeconds <= 0)
        continue
      measured.set(
        intervalKey(interval.phase),
        (interval.durationSeconds / interval.distanceMeters) * 1000,
      )
    }
  }

  return phases.map((phase) => (phase.exerciseId ? (measured.get(intervalKey(phase)) ?? 0) : 0))
}

/** Whether a session has anything at all to be paced against. */
export const hasPaceTargets = (pacing: Pacing) => pacing.targets.some((target) => target > 0)

/** The pacing a recording starts with when there is no session to compare to. */
export const pacingFor = (phases: readonly Phase[], reference?: Recording): Pacing => ({
  targets: paceTargets(phases, reference),
  toleranceSeconds: paceToleranceSeconds,
  minimumGapSeconds: paceMinimumGapSeconds,
  windowSeconds: paceWindowSeconds,
})

/** Where a reading sat against its target: outside the band, or holding it. */
type PaceZone = PaceTone | 'holding'

/** What the last reading left behind, and what the next one is read against. */
export interface PaceWatch {
  /** The interval the last reading was taken in. */
  phaseIndex: number
  /** Where that reading sat, or nothing before the interval has been judged. */
  zone?: PaceZone
  /** When a tone last played, on the recording's own clock. */
  tonedAt?: number
}

/** One reading of the pace, taken by whichever recorder is running. */
export interface PaceReading {
  /** The interval being worked, by its position in the prescription. */
  phaseIndex: number
  /** How long that interval has been running, pauses excluded. */
  phaseSeconds: number
  /** Pace now in seconds per kilometre, or nothing on too few fixes. */
  pace?: number
  at: number
}

/** The pacing a recording starts on: nothing judged, nothing heard. */
export const newPaceWatch = (): PaceWatch => ({ phaseIndex: -1 })

/**
 * The tone a reading calls for, and the watch to read the next one against.
 *
 * A tone marks the crossing rather than the state: pulling ahead is worth
 * hearing once, and again only after coming back and going out a second time.
 * A crossing the gap swallowed stays pending, so the athlete hears it late
 * rather than not at all.
 */
export const watchPace = (
  watch: PaceWatch,
  reading: PaceReading,
  pacing: Pacing,
): { watch: PaceWatch; tone?: PaceTone } => {
  // An interval is judged on its own: what the one before it was doing says
  // nothing about this one, and its last seconds are still inside the window.
  const zone = watch.phaseIndex === reading.phaseIndex ? watch.zone : undefined
  const target = pacing.targets[reading.phaseIndex] ?? 0
  if (!target || reading.pace === undefined || reading.phaseSeconds < pacing.windowSeconds)
    return { watch: { ...watch, phaseIndex: reading.phaseIndex, zone } }

  const now: PaceZone =
    reading.pace < target - pacing.toleranceSeconds
      ? 'ahead'
      : reading.pace > target + pacing.toleranceSeconds
        ? 'behind'
        : 'holding'
  const rested =
    watch.tonedAt === undefined || reading.at - watch.tonedAt >= pacing.minimumGapSeconds * 1000
  const tone = now !== 'holding' && now !== zone && rested ? now : undefined

  return {
    watch: {
      phaseIndex: reading.phaseIndex,
      zone: tone ?? (now === 'holding' ? now : zone),
      tonedAt: tone ? reading.at : watch.tonedAt,
    },
    tone,
  }
}
