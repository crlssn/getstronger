import type { RoutineGroup } from '@/proto/api/v1/routine_service_pb'
import { RoutineGroupMode } from '@/proto/api/v1/shared_pb'

export interface Phase {
  exerciseId: string
  stationKey: string
  name: string
  round: number
  durationSeconds: number
  instruction: string
}

export interface RoutePoint {
  timestamp: number
  latitude: number
  longitude: number
  accuracy: number
}

export interface Recording {
  version: 1
  startedAt: number
  endedAt?: number
  phases: Phase[]
  pauses: { startedAt: number; endedAt?: number }[]
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
    return Array.from({ length: group.rounds }, (_, index) =>
      stations.flatMap(({ entry, exercise, stationKey }, position) => {
        const phase: Phase = {
          exerciseId: exercise.id,
          stationKey,
          name: exercise.name,
          round: index + 1,
          durationSeconds: entry.targetDurationSeconds,
          instruction: instruction(exercise.name, entry.targetDurationSeconds),
        }
        const rest =
          position < stations.length - 1
            ? group.restBetweenExercisesSeconds
            : index < group.rounds - 1
              ? group.restBetweenRoundsSeconds
              : 0
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
      }),
    ).flat()
  })
}

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
    let remaining = phase.durationSeconds * 1000
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
    return { phase, windows, durationSeconds: phase.durationSeconds - remaining / 1000 }
  })
}

const radians = (degrees: number) => (degrees * Math.PI) / 180
const distance = (a: RoutePoint, b: RoutePoint) => {
  const h =
    Math.sin(radians(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(radians(b.longitude - a.longitude) / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)))
}
const interpolate = (a: RoutePoint, b: RoutePoint, timestamp: number): RoutePoint => {
  const fraction = (timestamp - a.timestamp) / (b.timestamp - a.timestamp)
  // Use the short arc when a route crosses the date line.
  const delta = ((b.longitude - a.longitude + 540) % 360) - 180
  return {
    timestamp,
    latitude: a.latitude + fraction * (b.latitude - a.latitude),
    longitude: ((a.longitude + fraction * delta + 540) % 360) - 180,
    accuracy: Math.max(a.accuracy, b.accuracy),
  }
}
const usable = (point: RoutePoint) =>
  Object.values(point).every(Number.isFinite) &&
  Math.abs(point.latitude) <= 90 &&
  Math.abs(point.longitude) <= 180 &&
  point.accuracy >= 0 &&
  point.accuracy <= 30

/** Attribute accepted GPS edges by time, splitting an edge at exercise boundaries. */
export const measureRoute = (recording: Recording, intervals: Interval[]) => {
  const routes = intervals.map((interval) => ({
    ...interval,
    distanceMeters: 0,
    segments: [] as [RoutePoint, RoutePoint][],
    incomplete: recording.interrupted,
  }))
  for (let index = 1; index < recording.points.length; index += 1) {
    const a = recording.points[index - 1]
    const b = recording.points[index]
    const seconds = (b.timestamp - a.timestamp) / 1000
    const meters = distance(a, b)
    const paused = recording.pauses.some(
      (pause) => a.timestamp < (pause.endedAt ?? Infinity) && b.timestamp > pause.startedAt,
    )
    const accepted =
      usable(a) && usable(b) && seconds > 0 && seconds <= 15 && meters / seconds <= 15 && !paused
    routes.forEach((route) => {
      if (!route.phase.exerciseId) return
      route.windows.forEach((window) => {
        const start = Math.max(window.start, a.timestamp)
        const end = Math.min(window.end, b.timestamp)
        if (end <= start) return
        if (!accepted) {
          route.incomplete = true
          return
        }
        route.distanceMeters += (meters * (end - start)) / (b.timestamp - a.timestamp)
        route.segments.push([interpolate(a, b, start), interpolate(a, b, end)])
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
