import type { RoutineGroup } from '@/proto/api/v1/routine_service_pb'

import { RoutineGroupMode } from '@/proto/api/v1/routine_service_pb'

/**
 * How a group's exercises are worked through: straight sets finish one exercise
 * before the next begins, a circuit takes one set of each in turn and repeats
 * for as long as the session keeps going round.
 */
export type GroupMode = 'straight' | 'circuit'

/** The rest a new circuit takes once a round closes. */
export const defaultRoundRestSeconds = 90

export const maximumRestSeconds = 3600

/**
 * One exercise where a routine trains it.
 *
 * It carries a key of its own because the same exercise may be in more than one
 * group — a bench press in the warm-up and a bench press in the circuit — and
 * moving one of them must not move the other. Twice inside one group is not a
 * thing: a group is a block of distinct work.
 */
export interface DraftEntry {
  key: string
  exerciseId: string
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
  restBetweenExercisesSeconds: number
  restBetweenRoundsSeconds: number
  entries: DraftEntry[]
}

let nextLocalId = 0

const newLocalId = (prefix: string) => {
  nextLocalId += 1
  return `${prefix}-${nextLocalId}`
}

const entriesOf = (exerciseIds: readonly string[]): DraftEntry[] =>
  exerciseIds.map((exerciseId) => ({ key: newLocalId('entry'), exerciseId }))

const straightGroup = (exerciseIds: readonly string[]): DraftGroup => ({
  id: newLocalId('group'),
  mode: 'straight',
  restBetweenExercisesSeconds: 0,
  restBetweenRoundsSeconds: 0,
  // Collapsing groups into one block can name the same exercise twice — it was
  // in two of them — and one block trains it once.
  entries: entriesOf([...new Set(exerciseIds)]),
})

/** What every routine starts as: one block, worked one exercise at a time. */
export const singleStraightGroup = (exerciseIds: readonly string[] = []): DraftGroup[] => [
  straightGroup(exerciseIds),
]

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

  return groups.map((group) => ({
    id: newLocalId('group'),
    mode: group.mode === RoutineGroupMode.CIRCUIT ? 'circuit' : 'straight',
    restBetweenExercisesSeconds: group.restBetweenExercisesSeconds,
    restBetweenRoundsSeconds: group.restBetweenRoundsSeconds,
    entries: entriesOf(group.exercises.map((exercise) => exercise.id)),
  }))
}

/** Whether the group already trains this exercise, and so will not take it again. */
export const groupHasExercise = (group: DraftGroup, exerciseId: string): boolean =>
  group.entries.some((entry) => entry.exerciseId === exerciseId)

export const addExerciseToGroup = (
  groups: readonly DraftGroup[],
  groupId: string,
  exerciseId: string,
): DraftGroup[] =>
  groups.map((group) =>
    group.id === groupId && !groupHasExercise(group, exerciseId)
      ? { ...group, entries: [...group.entries, { key: newLocalId('entry'), exerciseId }] }
      : group,
  )

export const removeEntry = (groups: readonly DraftGroup[], key: string): DraftGroup[] =>
  groups.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => entry.key !== key),
  }))

export const moveEntryToGroup = (
  groups: readonly DraftGroup[],
  key: string,
  targetGroupId: string,
): DraftGroup[] => {
  const moved = groups.flatMap((group) => group.entries).find((entry) => entry.key === key)
  const target = groups.find((group) => group.id === targetGroupId)
  if (!moved || !target) return [...groups]
  // The target already trains it, so there is nowhere for this one to land.
  if (groupHasExercise(target, moved.exerciseId)) return [...groups]

  return groups.map((group) => {
    const entries = group.entries.filter((entry) => entry.key !== key)
    return group.id === targetGroupId
      ? { ...group, entries: [...entries, moved] }
      : { ...group, entries }
  })
}

/** Nudges an exercise one place up or down inside the group holding it. */
export const moveEntryWithinGroup = (
  groups: readonly DraftGroup[],
  key: string,
  offset: -1 | 1,
): DraftGroup[] =>
  groups.map((group) => {
    const index = group.entries.findIndex((entry) => entry.key === key)
    const target = index + offset
    if (index < 0 || target < 0 || target >= group.entries.length) return group

    const entries = [...group.entries]
    const [moved] = entries.splice(index, 1)
    if (moved) entries.splice(target, 0, moved)

    return { ...group, entries }
  })

/**
 * A second group is nearly always the circuit somebody came here for, so it
 * arrives ready to rotate rather than as another straight block.
 */
export const addGroup = (groups: readonly DraftGroup[]): DraftGroup[] => [
  ...groups,
  {
    id: newLocalId('group'),
    mode: 'circuit',
    restBetweenExercisesSeconds: 0,
    restBetweenRoundsSeconds: defaultRoundRestSeconds,
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

/** Keeps a group's settings inside what the API accepts. */
export const clampGroup = (group: DraftGroup): DraftGroup => {
  if (group.mode !== 'circuit') {
    return { ...group, restBetweenExercisesSeconds: 0, restBetweenRoundsSeconds: 0 }
  }

  const clamp = (value: number) =>
    Math.min(Math.max(Number.isFinite(value) ? Math.round(value) : 0, 0), maximumRestSeconds)

  return {
    ...group,
    restBetweenExercisesSeconds: clamp(group.restBetweenExercisesSeconds),
    restBetweenRoundsSeconds: clamp(group.restBetweenRoundsSeconds),
  }
}

/** The groups as the API takes them: empty ones dropped, settings in range. */
export const saveableGroups = (groups: readonly DraftGroup[]): DraftGroup[] =>
  groups.filter((group) => group.entries.length > 0).map(clampGroup)
