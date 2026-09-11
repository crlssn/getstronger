import type { RoutineGroup } from '@/proto/api/v1/routine_service_pb'
import type { Exercise } from '@/proto/api/v1/shared_pb'

import { RoutineExerciseTracking } from '@/proto/api/v1/routine_service_pb'
import { RoutineGroupMode, RoutineGroupRole } from '@/proto/api/v1/shared_pb'

/**
 * How a block's exercises are worked through: straight sets finish one exercise
 * before the next begins, a circuit takes one set of each in turn and goes round
 * again, for the rounds it is prescribed or for as many as the session takes.
 */
export type GroupMode = 'straight' | 'circuit'

/**
 * Where a block sits in an interval routine: a warm-up worked once before the
 * round count, the block that count repeats, a cool-down worked once after it.
 *
 * The empty string is a block with no such place — every gym circuit, and every
 * routine saved before intervals existed. The editor never shows a role: a
 * block is named instead, and the Intervals preset writes both. The role is
 * what a live session reads to number its intervals, so it travels with the
 * block rather than being inferred from its name.
 */
export type GroupRole = '' | IntervalRole

/** One of the three parts an interval routine is built from. */
export type IntervalRole = 'warmup' | 'repeat' | 'cooldown'

/** The three parts of an interval routine, in the order they are trained. */
export const intervalRoles: readonly IntervalRole[] = ['warmup', 'repeat', 'cooldown']

/**
 * How one occurrence's work is counted, and so which of its three prescriptions
 * is the one that means anything: sets recovered between, a clock that ends the
 * effort, or a distance covered however long it takes.
 */
export type ExerciseTracking = 'sets' | 'timed' | 'distance'

/**
 * How long a new occurrence rests between its sets. The app's one answer to
 * that question: a session falls back to it too, and so does the server.
 */
export const defaultRestSeconds = 90

/** The rest a new circuit takes once a round closes. */
export const defaultRoundRestSeconds = 90

/** How many times a new circuit is prescribed to go round. */
export const defaultRounds = 3

/** How many sets a new occurrence prescribes. */
export const defaultSets = 3

/** How long a new timed occurrence is held for. */
export const defaultHoldSeconds = 30

/** How far a new distance occurrence covers, in metres. */
export const defaultDistanceMeters = 1000

/**
 * A block worked once through, which is what a warm-up and a cool-down are.
 * Stored as a round rather than as nothing so the recording guides them the
 * same way it guides the block between them.
 */
const singleRound = 1

const maximumRestSeconds = 3600

export const maximumRounds = 99

export const minimumSets = 1
export const maximumSets = 20

export const minimumDistanceMeters = 100
export const maximumDistanceMeters = 50000

/**
 * How far the distance stepper moves. Below a kilometre a hundred metres is a
 * lap of the track; above it, half a kilometre is the next thing worth running.
 */
export const distanceStepMeters = (meters: number) => (meters >= 1000 ? 500 : 100)

/**
 * One exercise where a routine trains it.
 *
 * It carries a key of its own because the same exercise may be in more than one
 * block — a bench press in the warm-up and a bench press in the circuit — and
 * removing one of them must not remove the other. Twice inside one block is not
 * a thing: a block is a piece of distinct work.
 *
 * All three prescriptions are held at once and only the tracked one is read, so
 * an occurrence switched from timed to sets and back is the one it was.
 */
export interface DraftEntry {
  key: string
  exerciseId: string
  tracking: ExerciseTracking
  /** Sets prescribed, read while tracked in sets. */
  sets: number
  /** Rest between sets; zero turns the timer off for this occurrence alone. */
  restSeconds: number
  /** Seconds held, read while tracked against the clock. */
  targetDurationSeconds: number
  /** Metres covered, read while tracked by distance. */
  targetDistanceMeters: number
}

/**
 * A block while it is being edited.
 *
 * The ID is local to the form: a save replaces a routine's blocks wholesale, so
 * the only thing it has to do is stay stable while the form is open.
 */
export interface DraftGroup {
  id: string
  /** What the athlete called it, or nothing at all — then it reads "Block A". */
  title: string
  mode: GroupMode
  /** Rest taken on the way from one exercise to the next; zero is no timer. */
  restBetweenExercisesSeconds: number
  /** Rest taken once a round closes; a circuit's alone. */
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
  /** Where this block sits in an interval routine, or nothing where it is not one. */
  role: GroupRole
  /**
   * Whether the repeating block drops its last exercise on its final round, so
   * a walk-run does not end the session with a walk.
   */
  skipLastOnFinalRound: boolean
  entries: DraftEntry[]
}

let nextLocalId = 0

const newLocalId = (prefix: string) => {
  nextLocalId += 1
  return `${prefix}-${nextLocalId}`
}

/** A block as it arrives: straight, worked once through, resting nowhere. */
export const newBlock = (block: Partial<DraftGroup> = {}): DraftGroup => ({
  id: newLocalId('group'),
  title: '',
  mode: 'straight',
  restBetweenExercisesSeconds: 0,
  restBetweenRoundsSeconds: defaultRoundRestSeconds,
  rounds: defaultRounds,
  role: '',
  skipLastOnFinalRound: false,
  entries: [],
  ...block,
})

/** One exercise, prescribed the way a new occurrence of it is. */
const newEntry = (exerciseId: string, tracking: ExerciseTracking): DraftEntry => ({
  key: newLocalId('entry'),
  exerciseId,
  tracking,
  sets: defaultSets,
  restSeconds: defaultRestSeconds,
  targetDurationSeconds: defaultHoldSeconds,
  targetDistanceMeters: defaultDistanceMeters,
})

/** What a routine starts as: one block, worked one exercise at a time. */
export const singleStraightGroup = (exerciseIds: readonly string[] = []): DraftGroup[] => [
  newBlock({ entries: exerciseIds.map((exerciseId) => newEntry(exerciseId, 'sets')) }),
]

/**
 * The shapes a new routine can start in.
 *
 * A starting shape rather than a mode: each of them is a list of blocks, and
 * nothing about the routine afterwards remembers which one it began as.
 */
export type StartingShape = 'blank' | 'circuit' | 'intervals'

/**
 * The blocks a starting shape lays out.
 *
 * Intervals is the one that writes roles as well as names: a live session reads
 * them to number its intervals and to end the repeating block an exercise
 * early, which no other shape has.
 */
export const startingBlocks = (shape: StartingShape, titles: Record<IntervalRole, string>) => {
  switch (shape) {
    case 'circuit':
      return [newBlock({ mode: 'circuit' })]
    case 'intervals':
      return intervalRoles.map((role) =>
        newBlock({
          title: titles[role],
          role,
          mode: role === 'repeat' ? 'circuit' : 'straight',
          rounds: role === 'repeat' ? defaultRounds : singleRound,
          restBetweenRoundsSeconds: role === 'repeat' ? defaultRoundRestSeconds : 0,
          // A walk-run that ends on a walk ends on the part nobody came for, so
          // a new repeating block drops it and the athlete turns that off.
          skipLastOnFinalRound: role === 'repeat',
        }),
      )
    default:
      return [newBlock()]
  }
}

/** A, B, C — how a block with no name of its own is spoken about. */
export const groupLetter = (index: number) => String.fromCharCode(65 + index)

/** Every exercise the routine trains, in order, repeats included. */
export const groupExerciseIds = (groups: readonly DraftGroup[]): string[] =>
  groups.flatMap((group) => group.entries.map((entry) => entry.exerciseId))

/** The part of an interval routine that plays this role, if the form holds one. */
export const intervalPartOf = (
  groups: readonly DraftGroup[],
  role: IntervalRole,
): DraftGroup | undefined => groups.find((group) => group.role === role)

/** How many rounds this block is worked through, counting a straight one once. */
const roundsOf = (group: DraftGroup) =>
  group.mode === 'circuit' ? Math.max(group.rounds, singleRound) : singleRound

/** Whether this block ends its final round an exercise early. */
const skipsLast = (group: DraftGroup): boolean =>
  group.skipLastOnFinalRound && group.mode === 'circuit' && group.entries.length > 1

/**
 * How long a set of an exercise takes when nothing times it: long enough to
 * work through and rack, which is what makes a planned minute a minute.
 */
const workingSetSeconds = 40

/**
 * How long a prescribed distance takes, per metre. Six minutes a kilometre is
 * a steady run, which is the pace a routine that prescribes a distance without
 * prescribing a time is most often written at.
 */
const secondsPerMetre = 0.36

/** How long one occurrence takes inside this block. */
const entrySeconds = (entry: DraftEntry, group: DraftGroup) => {
  switch (entry.tracking) {
    case 'timed':
      return entry.targetDurationSeconds
    case 'distance':
      return Math.round(entry.targetDistanceMeters * secondsPerMetre)
    default:
      // A circuit takes one set of each in turn, so a round holds one of them
      // however many the occurrence prescribes across the block.
      return group.mode === 'circuit'
        ? workingSetSeconds
        : entry.sets * workingSetSeconds + Math.max(entry.sets - 1, 0) * entry.restSeconds
  }
}

/** How long the routine is planned to take, in seconds. */
export const plannedSeconds = (groups: readonly DraftGroup[]): number =>
  groups.reduce((seconds, group) => {
    if (!group.entries.length) return seconds

    const rounds = roundsOf(group)
    const perRound =
      group.entries.reduce((sum, entry) => sum + entrySeconds(entry, group), 0) +
      group.restBetweenExercisesSeconds * (group.entries.length - 1)
    // A final round that ends an exercise early does not work it, and does not
    // take the pause on the way to it either.
    const dropped = skipsLast(group)
      ? entrySeconds(group.entries[group.entries.length - 1], group) +
        group.restBetweenExercisesSeconds
      : 0

    return seconds + perRound * rounds + group.restBetweenRoundsSeconds * (rounds - 1) - dropped
  }, 0)

/**
 * How many efforts the routine prescribes: one per set of a straight block, one
 * per exercise per round of a circuit, less the one a final round drops.
 */
export const plannedIntervals = (groups: readonly DraftGroup[]): number =>
  groups.reduce((count, group) => {
    const rounds = roundsOf(group)
    const perRound = group.entries.reduce(
      (sum, entry) =>
        sum + (group.mode === 'circuit' || entry.tracking !== 'sets' ? singleRound : entry.sets),
      0,
    )

    return count + perRound * rounds - (skipsLast(group) ? 1 : 0)
  }, 0)

/** Where a saved block sits in an interval routine, as the form names it. */
export const groupRole = (role: RoutineGroupRole): GroupRole => {
  switch (role) {
    case RoutineGroupRole.WARMUP:
      return 'warmup'
    case RoutineGroupRole.REPEAT:
      return 'repeat'
    case RoutineGroupRole.COOLDOWN:
      return 'cooldown'
    default:
      return ''
  }
}

/**
 * How a saved occurrence's work is counted.
 *
 * A routine saved before it could say carries nothing, and is read the way it
 * was read then: held against the clock where it prescribes a duration, counted
 * in sets everywhere else.
 */
export const trackingOf = (
  tracking: RoutineExerciseTracking,
  targetDurationSeconds: number,
): ExerciseTracking => {
  switch (tracking) {
    case RoutineExerciseTracking.TIMED:
      return 'timed'
    case RoutineExerciseTracking.DISTANCE:
      return 'distance'
    case RoutineExerciseTracking.SETS:
      return 'sets'
    default:
      return targetDurationSeconds > 0 ? 'timed' : 'sets'
  }
}

/** A saved value, or what a new occurrence would start at where there is none. */
const savedOr = (value: number, fallback: number) => (value > 0 ? value : fallback)

/** Reads a saved routine into the form, tolerating one saved before grouping. */
export const draftGroupsFromRoutine = (
  groups: readonly RoutineGroup[],
  exerciseIds: readonly string[],
): DraftGroup[] => {
  if (!groups.length) return singleStraightGroup(exerciseIds)

  return groups.map((group) => ({
    id: newLocalId('group'),
    title: group.title,
    mode: group.mode === RoutineGroupMode.CIRCUIT ? 'circuit' : 'straight',
    restBetweenExercisesSeconds: group.restBetweenExercisesSeconds,
    // A straight block has no round to close, so the length it shows once made
    // a circuit is the one a new circuit takes rather than a zero.
    restBetweenRoundsSeconds: savedOr(group.restBetweenRoundsSeconds, defaultRoundRestSeconds),
    rounds: group.rounds,
    role: groupRole(group.role),
    skipLastOnFinalRound: group.skipLastOnFinalRound,
    entries: group.exercises.map((entry) => ({
      key: newLocalId('entry'),
      exerciseId: entry.exercise?.id ?? '',
      tracking: trackingOf(entry.tracking, entry.targetDurationSeconds),
      // The two prescriptions this occurrence is not tracked by fall back to
      // what a new one would take, so switching to them offers a length rather
      // than a zero.
      sets: savedOr(entry.sets, defaultSets),
      restSeconds: entry.restSeconds,
      targetDurationSeconds: savedOr(entry.targetDurationSeconds, defaultHoldSeconds),
      targetDistanceMeters: savedOr(entry.targetDistanceMeters, defaultDistanceMeters),
    })),
  }))
}

/** Changes one block of the form and leaves the others as they are. */
export const withGroup = (
  groups: readonly DraftGroup[],
  groupId: string,
  changes: Partial<DraftGroup>,
): DraftGroup[] => groups.map((group) => (group.id === groupId ? { ...group, ...changes } : group))

/** Changes one occurrence and leaves every other one as it is. */
export const withEntry = (
  groups: readonly DraftGroup[],
  key: string,
  changes: Partial<DraftEntry>,
): DraftGroup[] =>
  groups.map((group) => ({
    ...group,
    entries: group.entries.map((entry) => (entry.key === key ? { ...entry, ...changes } : entry)),
  }))

/** Whether the block already trains this exercise, and so will not take it again. */
const groupHasExercise = (group: DraftGroup, exerciseId: string): boolean =>
  group.entries.some((entry) => entry.exerciseId === exerciseId)

export const addExerciseToGroup = (
  groups: readonly DraftGroup[],
  groupId: string,
  exercise: Exercise,
  tracking: ExerciseTracking,
): DraftGroup[] =>
  groups.map((group) =>
    group.id === groupId && !groupHasExercise(group, exercise.id)
      ? { ...group, entries: [...group.entries, newEntry(exercise.id, tracking)] }
      : group,
  )

export const removeEntry = (groups: readonly DraftGroup[], key: string): DraftGroup[] =>
  groups.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => entry.key !== key),
  }))

/**
 * Puts an exercise where it was dropped, in the block it was dropped into.
 *
 * Positions rather than a direction: the row is dragged to a place in a list,
 * and SortableJS reports which list and where in it. A block trains an exercise
 * once, so a row dropped onto a block already holding it goes back where it was.
 */
export const moveEntry = (
  groups: readonly DraftGroup[],
  fromGroupId: string,
  from: number,
  toGroupId: string,
  to: number,
): DraftGroup[] => {
  const source = groups.find((group) => group.id === fromGroupId)
  const target = groups.find((group) => group.id === toGroupId)
  const moved = source?.entries[from]
  if (!source || !target || !moved) return [...groups]
  if (fromGroupId === toGroupId && from === to) return [...groups]
  if (fromGroupId !== toGroupId && groupHasExercise(target, moved.exerciseId)) return [...groups]

  return groups.map((group) => {
    if (group.id !== fromGroupId && group.id !== toGroupId) return group

    const entries = [...group.entries]
    if (group.id === fromGroupId) entries.splice(from, 1)
    if (group.id === toGroupId) {
      entries.splice(Math.min(Math.max(to, 0), entries.length), 0, moved)
    }

    return { ...group, entries }
  })
}

/** Reorders inside one block, which is the move a keyboard makes. */
export const reorderEntry = (
  groups: readonly DraftGroup[],
  groupId: string,
  from: number,
  to: number,
): DraftGroup[] => {
  const group = groups.find((candidate) => candidate.id === groupId)
  const outOfRange = [from, to].some(
    (position) => position < 0 || position >= (group?.entries.length ?? 0),
  )
  if (outOfRange) return [...groups]

  return moveEntry(groups, groupId, from, groupId, to)
}

/** Appends the empty straight block "Add block" asks for. */
export const addGroup = (groups: readonly DraftGroup[]): DraftGroup[] => [...groups, newBlock()]

/**
 * Removes a block, handing its exercises to a neighbour so removing one never
 * removes exercises from the routine — except the ones the neighbour already
 * trains, which it cannot hold twice.
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

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(Number.isFinite(value) ? Math.round(value) : minimum, minimum), maximum)

/**
 * Keeps an occurrence's prescription inside what the API accepts, and says only
 * the one it is tracked by.
 *
 * The draft holds all three so switching between them and back costs nothing.
 * What is saved is what is prescribed: a run measured by distance that also
 * carried a leftover thirty seconds would be guided as a thirty-second run by
 * every reader that trusts the field.
 */
const clampEntry = (entry: DraftEntry): DraftEntry => {
  switch (entry.tracking) {
    case 'timed':
      return {
        ...entry,
        sets: 0,
        restSeconds: 0,
        targetDurationSeconds: clamp(entry.targetDurationSeconds, 0, maximumRestSeconds),
        targetDistanceMeters: 0,
      }
    case 'distance':
      return {
        ...entry,
        sets: 0,
        restSeconds: 0,
        targetDurationSeconds: 0,
        targetDistanceMeters: clamp(
          entry.targetDistanceMeters,
          minimumDistanceMeters,
          maximumDistanceMeters,
        ),
      }
    default:
      return {
        ...entry,
        sets: clamp(entry.sets, minimumSets, maximumSets),
        restSeconds: clamp(entry.restSeconds, 0, maximumRestSeconds),
        targetDurationSeconds: 0,
        targetDistanceMeters: 0,
      }
  }
}

/** Keeps a block's settings inside what the API accepts. */
const clampGroup = (group: DraftGroup): DraftGroup => {
  const circuit = group.mode === 'circuit'

  return {
    ...group,
    title: group.title.trim(),
    restBetweenExercisesSeconds: clamp(group.restBetweenExercisesSeconds, 0, maximumRestSeconds),
    // A straight block is worked once through, so it has no round to close and
    // none to count.
    restBetweenRoundsSeconds: circuit
      ? clamp(group.restBetweenRoundsSeconds, 0, maximumRestSeconds)
      : 0,
    // A part of an interval routine is worked at least once: an open-ended
    // warm-up is a session with no shape.
    rounds: circuit
      ? Math.max(clamp(group.rounds, 0, maximumRounds), group.role === '' ? 0 : singleRound)
      : 0,
    // Only the block a round count repeats has a final round to end early.
    skipLastOnFinalRound: group.skipLastOnFinalRound && circuit,
    entries: group.entries.map(clampEntry),
  }
}

/** The blocks as the API takes them: empty ones dropped, settings in range. */
export const saveableGroups = (groups: readonly DraftGroup[]): DraftGroup[] =>
  groups.filter((group) => group.entries.length > 0).map(clampGroup)
