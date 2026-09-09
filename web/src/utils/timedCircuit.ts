import type { RoutineGroup } from '@/proto/api/v1/routine_service_pb'
import type { IntervalRole } from '@/utils/routineGroups'

import { RoutineGroupMode, RoutineGroupRole } from '@/proto/api/v1/shared_pb'

/**
 * Where the block an interval came from sits in the routine: a warm-up worked
 * once before the round count, the block that count repeats, a cool-down worked
 * once after it. The recording keeps its own copy, so a routine edited later
 * cannot change how a finished session reads.
 */
export type PhaseRole = IntervalRole

export interface Phase {
  exerciseId: string
  stationKey: string
  name: string
  round: number
  /** Absent for an open interval, which runs until the athlete ends it. */
  durationSeconds?: number
  instruction: string
  /**
   * Absent for a gym circuit, and for every recording written before interval
   * routines existed — both of which read as their groups and rounds instead.
   */
  role?: PhaseRole
}

export interface RoutePoint {
  timestamp: number
  latitude: number
  longitude: number
  accuracy: number
  /**
   * Metres a second, when the receiver measured one. A phone standing still
   * knows it far better than the wandering fixes it reports do, which is what
   * the stationary detector leans on.
   */
  speed?: number
}

/** A stretch the recording did not measure, held by hand or by the detector. */
export interface Pause {
  startedAt: number
  endedAt?: number
  /** Opened by the stationary detector rather than by the athlete. */
  auto?: boolean
}

export interface Recording {
  version: 1
  startedAt: number
  endedAt?: number
  phases: Phase[]
  pauses: Pause[]
  points: RoutePoint[]
  interrupted: boolean
}

interface Interval {
  phase: Phase
  windows: { start: number; end: number }[]
  durationSeconds: number
}

/**
 * The recording a saved workout carries, or nothing when it carries none.
 *
 * A document an older client wrote is not worth failing the page for: the
 * workout around it still reads, it simply has no route.
 */
export const parseRecording = (json?: string): Recording | undefined => {
  if (!json) return undefined
  try {
    return JSON.parse(json) as Recording
  } catch {
    return undefined
  }
}

const phaseRoles: Partial<Record<RoutineGroupRole, PhaseRole>> = {
  [RoutineGroupRole.WARMUP]: 'warmup',
  [RoutineGroupRole.REPEAT]: 'repeat',
  [RoutineGroupRole.COOLDOWN]: 'cooldown',
}

/** Whether the session was recorded as intervals rather than as circuit rounds. */
export const isIntervalRecording = (recording: Recording): boolean =>
  recording.phases.some((phase) => phase.role)

/**
 * How many rounds the recording counted.
 *
 * An interval session counts the repeating block alone: its warm-up and its
 * cool-down are worked once, outside the count. A circuit counts every block.
 */
export const recordedRounds = (recording: Recording): number => {
  const counted = isIntervalRecording(recording)
    ? recording.phases.filter((phase) => phase.role === 'repeat')
    : recording.phases
  return counted.reduce((rounds, phase) => Math.max(rounds, phase.round), 0)
}

/** Freeze the prescription before recording so later routine edits cannot change it. */
export const circuitPhases = (
  groups: readonly RoutineGroup[],
  instruction: (name: string, seconds: number) => string,
  restName: string,
): Phase[] => {
  if (
    !groups.length ||
    groups.some(
      (group) =>
        group.mode !== RoutineGroupMode.CIRCUIT ||
        group.rounds < 1 ||
        !group.exercises.length ||
        group.exercises.some((entry) => !entry.exercise || entry.targetDurationSeconds <= 0),
    )
  )
    return []
  const occurrences = new Map<string, number>()
  return groups.flatMap((group) => {
    const stations = group.exercises.map((entry) => {
      const exercise = entry.exercise!
      const occurrence = (occurrences.get(exercise.id) ?? 0) + 1
      occurrences.set(exercise.id, occurrence)
      return {
        entry,
        exercise,
        stationKey: occurrence === 1 ? exercise.id : `${exercise.id}#${occurrence}`,
      }
    })
    const role = phaseRoles[group.role]
    return Array.from({ length: group.rounds }, (_, index) => {
      // A walk-run that ran its last walk ended on the part nobody came for, so
      // the repeating block may stop an exercise short of its final round.
      const finalRound = index === group.rounds - 1
      const worked =
        group.skipLastOnFinalRound && role === 'repeat' && finalRound && stations.length > 1
          ? stations.slice(0, -1)
          : stations

      return worked.flatMap(({ entry, exercise, stationKey }, position) => {
        const phase: Phase = {
          exerciseId: exercise.id,
          stationKey,
          name: exercise.name,
          round: index + 1,
          durationSeconds: entry.targetDurationSeconds,
          instruction: instruction(exercise.name, entry.targetDurationSeconds),
          ...(role ? { role } : {}),
        }
        const rest =
          position < worked.length - 1
            ? group.restBetweenExercisesSeconds
            : finalRound
              ? 0
              : group.restBetweenRoundsSeconds
        return rest > 0
          ? [
              phase,
              {
                ...phase,
                exerciseId: '',
                name: restName,
                durationSeconds: rest,
                instruction: instruction(restName, rest),
              },
            ]
          : [phase]
      })
    }).flat()
  })
}

/**
 * The prescription for a session with no set length: one interval, open-ended.
 *
 * A session entered blank names no exercise until it ends, so the phase carries
 * whatever it is known by at the time and is named for good by `namedRecording`.
 */
export const openSessionPhases = (name: string, instruction: string, exerciseId = ''): Phase[] => [
  { exerciseId, stationKey: exerciseId || 'open', name, round: 1, instruction },
]

/**
 * The recording read as one interval of `exercise`.
 *
 * An open session measures a route before it knows whose route it is: distances
 * are attributed to phases that name an exercise, so the screen names the one
 * interval provisionally and the save names it for good.
 */
export const namedRecording = (
  recording: Recording,
  exercise: { id: string; name: string },
): Recording => ({
  ...recording,
  phases: recording.phases.map((phase) =>
    phase.durationSeconds === undefined
      ? { ...phase, exerciseId: exercise.id, stationKey: exercise.id, name: exercise.name }
      : phase,
  ),
})

/** Split active time into wall-clock windows; pauses never belong to an interval. */
export const buildTimeline = (recording: Recording, now: number): Interval[] => {
  const end = Math.min(recording.endedAt ?? now, now)
  const active: { start: number; end: number }[] = []
  let cursor = recording.startedAt
  for (const pause of recording.pauses) {
    if (pause.startedAt > end) break
    if (pause.startedAt > cursor) active.push({ start: cursor, end: pause.startedAt })
    cursor = pause.endedAt ?? end
  }
  if (cursor < end) active.push({ start: cursor, end })
  let windowIndex = 0
  let start = active[0]?.start ?? end
  return recording.phases.map((phase) => {
    // An open interval takes every window left: it runs until `endedAt`, which
    // is where the active time already stops.
    let remaining = phase.durationSeconds === undefined ? Infinity : phase.durationSeconds * 1000
    const windows: Interval['windows'] = []
    while (remaining > 0 && windowIndex < active.length) {
      const window = active[windowIndex]
      const consumed = Math.min(remaining, window.end - start)
      if (consumed > 0) windows.push({ start, end: start + consumed })
      remaining -= consumed
      start += consumed
      if (start >= window.end) {
        windowIndex += 1
        start = active[windowIndex]?.start ?? end
      }
    }
    return {
      phase,
      windows,
      durationSeconds: windows.reduce((sum, window) => sum + window.end - window.start, 0) / 1000,
    }
  })
}

/**
 * The custom property an exercise's route is drawn in, by its position.
 *
 * The theme owns the six hues, in both palettes; this only cycles through
 * them, so the live screen and the saved route colour the same run alike.
 */
export const routeToken = (index: number) => `--color-route-${(index % 6) + 1}`

const radians = (degrees: number) => (degrees * Math.PI) / 180

/** How far apart two fixes are, in metres, over the great circle between them. */
export const metersBetween = (a: RoutePoint, b: RoutePoint) => {
  const h =
    Math.sin(radians(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(radians(b.longitude - a.longitude) / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
}
/** The short way round between two longitudes, in degrees. */
const eastward = (from: number, to: number) => ((to - from + 540) % 360) - 180

const wrapLongitude = (longitude: number) => ((longitude + 540) % 360) - 180

/** A point `fraction` of the way along the chord from `a` to `b`, stamped `timestamp`. */
const along = (a: RoutePoint, b: RoutePoint, fraction: number, timestamp: number): RoutePoint => ({
  timestamp,
  latitude: a.latitude + fraction * (b.latitude - a.latitude),
  longitude: wrapLongitude(a.longitude + fraction * eastward(a.longitude, b.longitude)),
  accuracy: Math.max(a.accuracy, b.accuracy),
})

/** Whether a fix is precise enough, and sane enough, to place the athlete by. */
export const usableFix = (point: RoutePoint) =>
  [point.timestamp, point.latitude, point.longitude, point.accuracy].every(Number.isFinite) &&
  Math.abs(point.latitude) <= 90 &&
  Math.abs(point.longitude) <= 180 &&
  point.accuracy >= 0 &&
  point.accuracy <= 30

/**
 * How fast the filter lets the athlete have moved since the last fix, in
 * metres a second: the process noise of the position filter.
 *
 * Higher trusts each fix more and smooths less; lower trails the athlete
 * further behind and cuts the corners. Three is a run: simulated against a
 * loop with turns it reads a run within a few percent either way, where the
 * bare chords read a jittering walk at twice its length.
 */
const wanderSpeed = 3

/**
 * The route as the athlete most likely ran it, one smoothed fix per usable
 * one.
 *
 * A fix is where the receiver thinks the phone is, give or take its accuracy,
 * and consecutive fixes wander inside that circle: summed as chords they read
 * more ground than was covered, worst at a walk and under trees. This is a
 * one-dimensional Kalman filter on each axis, weighing every fix by its
 * accuracy against how far the athlete could have moved since the last: a
 * precise fix is believed outright, a vague one nudges the estimate, and a fix
 * a minute after the last is believed again whatever it says. Fixes too vague
 * to place at all are left out, and the edge across them bridges the gap.
 */
export const smoothRoute = (points: readonly RoutePoint[]): RoutePoint[] => {
  const smoothed: RoutePoint[] = []
  let latitude = 0
  let longitude = 0
  let variance = 0
  let at = 0
  for (const point of points) {
    if (!usableFix(point) || (smoothed.length > 0 && point.timestamp <= at)) continue
    const noise = point.accuracy ** 2
    if (smoothed.length === 0) {
      latitude = point.latitude
      longitude = point.longitude
      variance = noise
    } else {
      variance += (wanderSpeed ** 2 * (point.timestamp - at)) / 1000
      const gain = variance + noise > 0 ? variance / (variance + noise) : 1
      latitude += gain * (point.latitude - latitude)
      longitude = wrapLongitude(longitude + gain * eastward(longitude, point.longitude))
      variance *= 1 - gain
    }
    at = point.timestamp
    smoothed.push({ ...point, latitude, longitude })
  }
  return smoothed
}

/**
 * The slowest a receiver reads while an athlete is still going, in metres a
 * second. Below it, a measured speed is the phone standing and its fixes
 * wandering, which is jitter and not ground covered.
 */
const standingSpeed = 0.3

/**
 * The ground the trailing window holds before a live pace is a number, in
 * metres.
 *
 * Two fixes seconds apart, taken while the athlete is still turning out of the
 * drive, are enough to divide by — and the figure that comes out is wrong by a
 * wide margin and then jumps, on the screen it is looked at hardest. Twenty
 * metres is a few seconds of running, well above the wander of a standing
 * phone, and short enough that the dash does not linger.
 */
export const paceFloorMeters = 20

const measuredSpeed = (point: RoutePoint) =>
  point.speed !== undefined && Number.isFinite(point.speed) && point.speed >= 0
    ? point.speed
    : undefined

/**
 * How far the athlete went between two smoothed fixes, in metres.
 *
 * The chord between them, unless the receiver read the phone as standing at
 * both ends: a phone at a crossing reports fixes metres apart and a speed of
 * nothing, and the receiver's speed is filtered where its fixes are not.
 */
export const edgeMeters = (a: RoutePoint, b: RoutePoint) => {
  const from = measuredSpeed(a)
  const to = measuredSpeed(b)
  if (from !== undefined && to !== undefined && (from + to) / 2 < standingSpeed) return 0
  return metersBetween(a, b)
}

/**
 * Whether the movement between two smoothed fixes is worth measuring: in
 * order, and slow enough to be a person on foot.
 *
 * Every distance in the app is summed from edges this accepts, so the live
 * numbers and the saved route cannot disagree about what counted.
 */
const accepted = (a: RoutePoint, b: RoutePoint) => {
  const seconds = (b.timestamp - a.timestamp) / 1000
  return seconds > 0 && metersBetween(a, b) / seconds <= 15
}

const overlapsPause = (pause: Pause, from: number, to: number) =>
  from < (pause.endedAt ?? Infinity) && to > pause.startedAt

/** How much of `from` to `to` the recording was held for. */
const pausedMs = (recording: Recording, from: number, to: number) =>
  recording.pauses.reduce(
    (sum, pause) =>
      sum + Math.max(0, Math.min(pause.endedAt ?? Infinity, to) - Math.max(pause.startedAt, from)),
    0,
  )

/**
 * Pace over the last few seconds, in seconds per kilometre, or nothing.
 *
 * An interval's average says how the interval went; a runner mid-interval is
 * asking how they are going now, which is a short trailing window. Nothing
 * until the window has covered `floorMeters`: a dash is honest where a number
 * divided out of the first few metres is not. A caller judging a reading
 * rather than showing it passes a floor of its own.
 */
export const currentPace = (
  recording: Recording,
  now: number,
  windowSeconds = 15,
  floorMeters = paceFloorMeters,
) => {
  const since = now - windowSeconds * 1000
  const points = smoothRoute(recording.points)
  let meters = 0
  let seconds = 0
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]
    const b = points[index]
    // Whole edges, by the fix that closed them: clipping one to the window
    // would weigh a partial edge against a window it was never measured over.
    if (b.timestamp <= since || b.timestamp > now) continue
    if (!accepted(a, b)) continue
    // An edge across a pause is mostly standing, which is not a pace.
    if (recording.pauses.some((pause) => overlapsPause(pause, a.timestamp, b.timestamp))) continue
    meters += edgeMeters(a, b)
    seconds += (b.timestamp - a.timestamp) / 1000
  }
  return meters > 0 && meters >= floorMeters ? (seconds / meters) * 1000 : undefined
}

/** One interval as it was actually run: how long it took, and how far it went. */
export type MeasuredInterval = ReturnType<typeof measureRoute>[number]

/**
 * Attribute the smoothed route's edges to intervals by time, splitting an edge
 * at exercise boundaries.
 *
 * An edge across a pause the detector held is the standing plus the first
 * strides out of it, so its ground goes to the active time either side. One
 * across a pause the athlete held by hand is dropped: they may have wandered
 * off while held, and the interval reads as incomplete for it.
 */
export const measureRoute = (recording: Recording, intervals: Interval[]) => {
  const routes = intervals.map((interval) => ({
    ...interval,
    distanceMeters: 0,
    segments: [] as [RoutePoint, RoutePoint][],
    incomplete: recording.interrupted,
  }))
  const points = smoothRoute(recording.points)
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]
    const b = points[index]
    const meters = edgeMeters(a, b)
    const counts =
      accepted(a, b) &&
      !recording.pauses.some(
        (pause) => !pause.auto && overlapsPause(pause, a.timestamp, b.timestamp),
      )
    const activeMs = b.timestamp - a.timestamp - pausedMs(recording, a.timestamp, b.timestamp)
    const activeBefore = (timestamp: number) =>
      (timestamp - a.timestamp - pausedMs(recording, a.timestamp, timestamp)) / activeMs
    routes.forEach((route) => {
      if (!route.phase.exerciseId) return
      route.windows.forEach((window) => {
        const start = Math.max(window.start, a.timestamp)
        const end = Math.min(window.end, b.timestamp)
        if (end <= start) return
        if (!counts) {
          route.incomplete = true
          return
        }
        if (activeMs <= 0) return
        route.distanceMeters += (meters * (end - start)) / activeMs
        route.segments.push([
          along(a, b, activeBefore(start), start),
          along(a, b, activeBefore(end), end),
        ])
      })
    })
  }
  routes.forEach((route) => {
    const covered = route.segments.reduce((sum, [a, b]) => sum + b.timestamp - a.timestamp, 0)
    if (
      route.durationSeconds > 0 &&
      (!route.segments.length || covered + 5000 < route.durationSeconds * 1000)
    )
      route.incomplete = true
  })
  return routes
}

/**
 * Seconds per kilometre over a whole distance, or nothing when there is none.
 *
 * A session with no set length has no interval to compare against, so what it
 * says beside the pace now is the average over the whole of it.
 */
export const averagePace = (meters: number, seconds: number): number | undefined =>
  meters > 0 && seconds > 0 ? (seconds * 1000) / meters : undefined
