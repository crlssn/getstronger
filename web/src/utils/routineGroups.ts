import type { RoutineGroup } from '@/proto/api/v1/routine_service_pb'
import type { Exercise } from '@/proto/api/v1/shared_pb'

import { ExerciseMetric, RoutineGroupMode } from '@/proto/api/v1/shared_pb'

/**
 * How a group's exercises are worked through: straight sets finish one exercise
 * before the next begins, a circuit takes one set of each in turn and goes round
 * again, for the rounds it is prescribed or for as many as the session takes.
 */
export type GroupMode = 'straight' | 'circuit'

/** How long an exercise rests between sets when nothing says otherwise. */
export const defaultRestSeconds = 90

/** The rest a new circuit takes once a round closes. */
export const defaultRoundRestSeconds = 90

/** How many times a new circuit is prescribed to go round. */
export const defaultRounds = 3

export const maximumRestSeconds = 3600

export const maximumRounds = 99

/**
 * How long an exercise rests between sets where a routine has just started
 * training it.
 *
 * An exercise measured against the clock — a plank, a run — is one continuous
 * effort rather than a set to recover from, so it starts with no timer at all.
 */
export const newOccurrenceRestSeconds = (exercise: Exercise): number =>
  exercise.metrics.includes(ExerciseMetric.TIME) ? 0 : defaultRestSeconds

/**
 * One exercise where a routine trains it.
 *
 * It carries a key of its own because the same exercise may be in more than one
 * group — a bench press in the warm-up and a bench press in the circuit — and
 * removing one of them must not remove the other. Twice inside one group is not
 * a thing: a group is a block of distinct work.
 */
export interface DraftEntry {
  key: string
  exerciseId: string
  /**
   * How long this occurrence rests between sets; zero turns the timer off here
   * alone. A circuit rests between exercises and between rounds, so it never
   * applies — the value is kept while the group is one, so switching back
   * restores what was typed.
   */
  restSeconds: number
}

/**
 * A group while it is being edited.
 *
 * The ID is local to the form: a save replaces a routine's groups wholesale, so
 * the only thing it has to do is stay stable while the form is open.
 */
export interface DraftGroup {
  id: string
  mode: GroupMode
  /**
   * Whether this block runs a rest timer at all.
   *
   * Off is stored as no rest anywhere in the block, since "no timer" and "rest
   * for nothing" are the same session. The lengths stay in the draft while it
   * is off, so flipping it twice costs nothing.
   */
  restTimers: boolean
  restBetweenExercisesSeconds: number
  restBetweenRoundsSeconds: number
  /**
   * How many times a circuit is prescribed to go round; zero runs it for as
   * many rounds as the session takes.
   *
   * A target rather than a limit — the session may take another round or stop
   * short of it — and a setting only a circuit has, so it is kept while the
   * block is straight sets rather than cleared.
   */
  rounds: number
  entries: DraftEntry[]
}

let nextLocalId = 0

const newLocalId = (prefix: string) => {
  nextLocalId += 1
  return `${prefix}-${nextLocalId}`
}

const straightGroup = (
  entries: DraftEntry[],
  restBetweenExercisesSeconds = defaultRestSeconds,
): DraftGroup => ({
  id: newLocalId('group'),
  mode: 'straight',
  restTimers: true,
  restBetweenExercisesSeconds,
  // A straight block is worked once through, so there is no round to close,
  // and none to count.
  restBetweenRoundsSeconds: 0,
  rounds: 0,
  entries,
})

/**
 * What every routine starts as: one block, worked one exercise at a time.
 *
 * Named by ID rather than by exercise because the only caller that has nothing
 * but IDs is a routine saved before grouping, where what each of them measures
 * was never recorded against the occurrence either.
 */
export const singleStraightGroup = (exerciseIds: readonly string[] = []): DraftGroup[] => [
  straightGroup(
    exerciseIds.map((exerciseId) => ({
      key: newLocalId('entry'),
      exerciseId,
      restSeconds: defaultRestSeconds,
    })),
  ),
]

/**
 * Collapses a grouped routine into the one block a plain routine is.
 *
 * The exercises keep their order and the rest each of them takes; only the
 * structure goes, which is the one thing a single block cannot express. Two
 * groups can name the same exercise, and one block trains it once.
 */
export const collapseToSingleGroup = (groups: readonly DraftGroup[]): DraftGroup[] => {
  // One block cannot run two timers, so it runs one if any block did.
  const restTimers = groups.some((group) => group.restTimers)
  const seen = new Set<string>()
  const entries = groups
    .flatMap((group) => group.entries)
    .filter((entry) => {
      if (seen.has(entry.exerciseId)) return false
      seen.add(entry.exerciseId)
      return true
    })

  // The block keeps the first group's pause between exercises: the structure is
  // what a single block cannot express, not the rests.
  return [{ ...straightGroup(entries, groups[0]?.restBetweenExercisesSeconds), restTimers }]
}

/** A, B, C — how a group is named everywhere it is spoken about. */
export const groupLetter = (index: number) => String.fromCharCode(65 + index)

/** Every exercise the routine trains, in order, repeats included. */
export const groupExerciseIds = (groups: readonly DraftGroup[]): string[] =>
  groups.flatMap((group) => group.entries.map((entry) => entry.exerciseId))

/**
 * Whether the routine uses grouping at all.
 *
 * One straight group is the plain routine the form opens on, so it is what the
 * advanced controls stay folded away for.
 */
export const isGrouped = (groups: readonly DraftGroup[]): boolean =>
  groups.length > 1 || groups.some((group) => group.mode === 'circuit')

/** Reads a saved routine into the form, tolerating one saved before grouping. */
export const draftGroupsFromRoutine = (
  groups: readonly RoutineGroup[],
  exerciseIds: readonly string[],
): DraftGroup[] => {
  if (!groups.length) return singleStraightGroup(exerciseIds)

  return groups.map((group) => {
    // A block that rests nowhere is a block with the timer off. Its fields fall
    // back to what a new occurrence would take, so switching the timer on hands
    // back a routine's worth of lengths rather than a column of zeros.
    const restTimers =
      group.restBetweenExercisesSeconds > 0 ||
      group.restBetweenRoundsSeconds > 0 ||
      group.exercises.some((entry) => entry.restSeconds > 0)

    return {
      id: newLocalId('group'),
      mode: group.mode === RoutineGroupMode.CIRCUIT ? 'circuit' : 'straight',
      restTimers,
      restBetweenExercisesSeconds: restTimers
        ? group.restBetweenExercisesSeconds
        : defaultRestSeconds,
      restBetweenRoundsSeconds: restTimers
        ? group.restBetweenRoundsSeconds
        : defaultRoundRestSeconds,
      rounds: group.rounds,
      entries: group.exercises.map((entry) => ({
        key: newLocalId('entry'),
        exerciseId: entry.exercise?.id ?? '',
        restSeconds: restTimers
          ? entry.restSeconds
          : ((entry.exercise && newOccurrenceRestSeconds(entry.exercise)) ?? defaultRestSeconds),
      })),
    }
  })
}

/** Whether the group already trains this exercise, and so will not take it again. */
export const groupHasExercise = (group: DraftGroup, exerciseId: string): boolean =>
  group.entries.some((entry) => entry.exerciseId === exerciseId)

export const addExerciseToGroup = (
  groups: readonly DraftGroup[],
  groupId: string,
  exercise: Exercise,
): DraftGroup[] =>
  groups.map((group) =>
    group.id === groupId && !groupHasExercise(group, exercise.id)
      ? {
          ...group,
          entries: [
            ...group.entries,
            {
              key: newLocalId('entry'),
              exerciseId: exercise.id,
              restSeconds: newOccurrenceRestSeconds(exercise),
            },
          ],
        }
      : group,
  )

export const removeEntry = (groups: readonly DraftGroup[], key: string): DraftGroup[] =>
  groups.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => entry.key !== key),
  }))

/**
 * Puts an exercise where it was dropped inside the group holding it.
 *
 * Positions rather than a direction: the row is dragged to a place in the list,
 * and SortableJS reports where it landed.
 */
export const reorderEntry = (
  groups: readonly DraftGroup[],
  groupId: string,
  from: number,
  to: number,
): DraftGroup[] =>
  groups.map((group) => {
    if (group.id !== groupId) return group

    const outOfRange = [from, to].some(
      (position) => position < 0 || position >= group.entries.length,
    )
    if (from === to || outOfRange) return group

    const entries = [...group.entries]
    const [moved] = entries.splice(from, 1)
    if (moved) entries.splice(to, 0, moved)

    return { ...group, entries }
  })

/** Sets how long one exercise rests between sets where this routine trains it. */
export const setEntryRest = (
  groups: readonly DraftGroup[],
  key: string,
  restSeconds: number,
): DraftGroup[] =>
  groups.map((group) => ({
    ...group,
    entries: group.entries.map((entry) => (entry.key === key ? { ...entry, restSeconds } : entry)),
  }))

/**
 * A second group is nearly always the circuit somebody came here for, so it
 * arrives ready to rotate rather than as another straight block.
 */
export const addGroup = (groups: readonly DraftGroup[]): DraftGroup[] => [
  ...groups,
  {
    id: newLocalId('group'),
    mode: 'circuit',
    restTimers: true,
    restBetweenExercisesSeconds: 0,
    restBetweenRoundsSeconds: defaultRoundRestSeconds,
    rounds: defaultRounds,
    entries: [],
  },
]

/**
 * Removes a group, handing its exercises to a neighbour so removing a block
 * never removes exercises from the routine — except the ones the neighbour
 * already trains, which it cannot hold twice.
 */
export const removeGroup = (groups: readonly DraftGroup[], groupId: string): DraftGroup[] => {
  if (groups.length < 2) return [...groups]

  const index = groups.findIndex((group) => group.id === groupId)
  if (index < 0) return [...groups]

  const removed = groups[index]
  const neighbour = index > 0 ? index - 1 : 0

  return groups
    .filter((_, position) => position !== index)
    .map((group, position) => {
      if (position !== neighbour) return group

      const taken = (removed?.entries ?? []).filter(
        (entry) => !groupHasExercise(group, entry.exerciseId),
      )
      return { ...group, entries: [...group.entries, ...taken] }
    })
}

const clampRest = (value: number) =>
  Math.min(Math.max(Number.isFinite(value) ? Math.round(value) : 0, 0), maximumRestSeconds)

const clampRounds = (value: number) =>
  Math.min(Math.max(Number.isFinite(value) ? Math.round(value) : 0, 0), maximumRounds)

/** Keeps a group's settings inside what the API accepts. */
export const clampGroup = (group: DraftGroup): DraftGroup => {
  // Rounds are how the block is worked through rather than how it rests, so a
  // block with its timer off is still prescribed for the rounds it says.
  const rounds = group.mode === 'circuit' ? clampRounds(group.rounds) : 0

  // No timer is no rest: the lengths the draft is holding are what the switch
  // would hand back, not what this routine trains with.
  if (!group.restTimers) {
    return {
      ...group,
      restBetweenExercisesSeconds: 0,
      restBetweenRoundsSeconds: 0,
      rounds,
      entries: group.entries.map((entry) => ({ ...entry, restSeconds: 0 })),
    }
  }

  // A circuit rests on the way to the next exercise and on the way into the
  // next round, so a set rest has nowhere to go while it is one. It travels
  // anyway, so a group switched back to straight sets rests as it did before.
  const entries = group.entries.map((entry) => ({
    ...entry,
    restSeconds: clampRest(entry.restSeconds),
  }))

  // A straight block pauses on the way to the next exercise like a circuit
  // does; what it has no use for is a round rest or a round count, having no
  // rounds.
  if (group.mode !== 'circuit') {
    return {
      ...group,
      restBetweenExercisesSeconds: clampRest(group.restBetweenExercisesSeconds),
      restBetweenRoundsSeconds: 0,
      rounds,
      entries,
    }
  }

  return {
    ...group,
    restBetweenExercisesSeconds: clampRest(group.restBetweenExercisesSeconds),
    restBetweenRoundsSeconds: clampRest(group.restBetweenRoundsSeconds),
    rounds,
    entries,
  }
}

/** The groups as the API takes them: empty ones dropped, settings in range. */
export const saveableGroups = (groups: readonly DraftGroup[]): DraftGroup[] =>
  groups.filter((group) => group.entries.length > 0).map(clampGroup)
