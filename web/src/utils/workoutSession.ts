import type { RoutineGroup } from '@/proto/api/v1/routine_service_pb'
import type { Exercise } from '@/proto/api/v1/shared_pb'
import type { Set } from '@/types/workout'
import type { GroupMode } from '@/utils/routineGroups'

import { RoutineGroupMode } from '@/proto/api/v1/routine_service_pb'
import { hasAnyExerciseSetValue, isExerciseSetComplete } from '@/utils/exerciseMeasurements'

/** The rest a completed set starts when its exercise names no length of its own. */
export const defaultRestSeconds = 90

/** How much a "+30 sec" tap adds to a running rest. */
export const restExtensionSeconds = 30

/**
 * The session clock, as the header shows it.
 *
 * Under an hour it is m:ss so the shape stays familiar; past one it gains the
 * hours rather than counting to 90 minutes.
 */
export const elapsedLabel = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = (seconds % 60).toString().padStart(2, '0')

  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${remainder}`
  return `${minutes}:${remainder}`
}

export interface SessionExercise {
  exercise: Exercise
  sets: Set[]
}

/** Sets with everything their exercise measures filled in. */
export const loggedSetCount = (entries: readonly SessionExercise[]): number =>
  entries.reduce(
    (total, { exercise, sets }) =>
      total + sets.filter((set) => isExerciseSetComplete(set, exercise)).length,
    0,
  )

/** Sets somebody started and did not finish, which is what blocks a save. */
export const incompleteSetCount = (entries: readonly SessionExercise[]): number =>
  entries.reduce(
    (total, { exercise, sets }) =>
      total +
      sets.filter(
        (set) => hasAnyExerciseSetValue(set, exercise) && !isExerciseSetComplete(set, exercise),
      ).length,
    0,
  )

export type FinishBlocker =
  | { reason: 'loading' }
  | { reason: 'noExercises' }
  | { reason: 'partialSets'; count: number }
  | { reason: 'nothingLogged' }

/**
 * Why the session cannot be saved yet, or `undefined` when it can.
 *
 * An empty quick workout is not blocked by "no exercises": there is nothing to
 * fix, only something to add, and the screen says that in its own empty state.
 */
export const finishBlocker = (
  entries: readonly SessionExercise[] | undefined,
  quickWorkout: boolean,
): FinishBlocker | undefined => {
  if (!entries) return { reason: 'loading' }
  if (!entries.length) return quickWorkout ? undefined : { reason: 'noExercises' }

  const partial = incompleteSetCount(entries)
  if (partial > 0) return { reason: 'partialSets', count: partial }

  if (!loggedSetCount(entries)) return { reason: 'nothingLogged' }
  return undefined
}

/**
 * The set the user is about to log, which is the row that carries the emphasis.
 *
 * Returns -1 when every set is done, so nothing is highlighted on an exercise
 * that has been worked through.
 */
export const activeSetIndex = (sets: readonly Set[], exercise?: Exercise): number =>
  sets.findIndex((set) => !isExerciseSetComplete(set, exercise))

/**
 * The station to move to after completing the one at `from`.
 *
 * The next unfinished one below it, or failing that the first unfinished one
 * anywhere — so working out of order still lands somewhere useful. Returns -1
 * once everything is done.
 */
export const nextUnfinishedStation = (
  stations: readonly { key: string }[],
  completed: Record<string, boolean>,
  from: number,
): number => {
  const below = stations.findIndex((station, index) => index > from && !completed[station.key])
  if (below >= 0) return below

  return stations.findIndex((station, index) => index !== from && !completed[station.key])
}

/**
 * One exercise where the session trains it.
 *
 * The key is the exercise's ID the first time it appears and gains a suffix
 * after that, so a routine that trains the bench press in two groups logs two
 * sets of sets — and every routine written before repeats were allowed keeps
 * the keys, and therefore the drafts, it already had.
 */
export interface SessionStation {
  key: string
  exercise: Exercise
}

/** One block of the session: stations, and how they are worked through. */
export interface SessionGroup {
  id: string
  mode: GroupMode
  restBetweenExercisesSeconds: number
  restBetweenRoundsSeconds: number
  stations: SessionStation[]
}

export const stationKey = (exerciseID: string, occurrence: number): string =>
  occurrence === 0 ? exerciseID : `${exerciseID}#${occurrence + 1}`

/**
 * The session laid out in blocks.
 *
 * Built from the routine's groups, narrowed to the exercises the session
 * actually holds. Anything the routine does not know about — a quick workout,
 * or an exercise added mid-session — trails behind as a straight block, which
 * is how it is trained.
 */
export const sessionGroups = (
  groups: readonly RoutineGroup[] | undefined,
  exercises: readonly Exercise[],
): SessionGroup[] => {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  const occurrences = new Map<string, number>()

  const stationFor = (exercise: Exercise): SessionStation => {
    const occurrence = occurrences.get(exercise.id) ?? 0
    occurrences.set(exercise.id, occurrence + 1)
    return { key: stationKey(exercise.id, occurrence), exercise }
  }

  const blocks: SessionGroup[] = []
  for (const group of groups ?? []) {
    const stations = group.exercises
      .map((exercise) => byId.get(exercise.id))
      .filter((exercise) => exercise !== undefined)
      .map(stationFor)

    blocks.push({
      id: group.id,
      mode: group.mode === RoutineGroupMode.CIRCUIT ? 'circuit' : 'straight',
      restBetweenExercisesSeconds: group.restBetweenExercisesSeconds,
      restBetweenRoundsSeconds: group.restBetweenRoundsSeconds,
      stations,
    })
  }

  // Whatever the groups did not account for: every exercise of a quick workout,
  // and anything added while training.
  const held = new Map<string, number>()
  exercises.forEach((exercise) => held.set(exercise.id, (held.get(exercise.id) ?? 0) + 1))

  const trailing: SessionStation[] = []
  for (const [exerciseID, count] of held) {
    const exercise = byId.get(exerciseID)
    if (!exercise) continue

    for (let index = occurrences.get(exerciseID) ?? 0; index < count; index += 1) {
      trailing.push(stationFor(exercise))
    }
  }

  if (blocks.length === 0 || trailing.length > 0) {
    blocks.push({
      id: 'ungrouped',
      mode: 'straight',
      restBetweenExercisesSeconds: 0,
      restBetweenRoundsSeconds: 0,
      stations: trailing,
    })
  }

  return blocks.filter((block) => block.stations.length > 0)
}

/**
 * The round a circuit is on, read off what has been logged.
 *
 * The round only turns over once every exercise in it has taken its set, so an
 * athlete part-way round is still in the round they are walking through. There
 * is no last one: a circuit goes round until the session says it is done.
 */
export const circuitRound = (group: SessionGroup, loggedCounts: Record<string, number>): number =>
  completedCircuitRounds(group, loggedCounts) + 1

/** Rounds every station in the group has already taken a set in. */
export const completedCircuitRounds = (
  group: SessionGroup,
  loggedCounts: Record<string, number>,
): number => {
  if (!group.stations.length) return 0

  return Math.min(...group.stations.map((station) => loggedCounts[station.key] ?? 0))
}

/** Where completing a set in a circuit leaves the session. */
export type CircuitStep =
  | { kind: 'nextStation'; key: string; restSeconds: number }
  | { kind: 'nextRound'; key: string; round: number; restSeconds: number }
  | { kind: 'groupComplete' }

/**
 * The step a circuit takes after the exercise in front of you.
 *
 * Along the group inside a round, and back to the top when the round closes.
 * Each step carries the rest that belongs to it: the shorter one on the way to
 * the next exercise, the longer one on the way into the next round. A circuit
 * has no last round to walk out of — it ends when the session says so, which is
 * the only thing that returns `groupComplete`.
 *
 * `completedRounds` is how many rounds the whole group has been through, which
 * is what numbers the round being started. The round on the header is already
 * counting the one being walked.
 */
export const nextCircuitStep = (
  group: SessionGroup,
  key: string,
  completedRounds: number,
): CircuitStep => {
  const index = group.stations.findIndex((station) => station.key === key)
  if (index < 0) return { kind: 'groupComplete' }

  const next = group.stations[index + 1]
  if (next) {
    return {
      kind: 'nextStation',
      key: next.key,
      restSeconds: group.restBetweenExercisesSeconds,
    }
  }

  const first = group.stations[0]
  if (!first) return { kind: 'groupComplete' }

  return {
    kind: 'nextRound',
    key: first.key,
    round: completedRounds + 1,
    restSeconds: group.restBetweenRoundsSeconds,
  }
}
