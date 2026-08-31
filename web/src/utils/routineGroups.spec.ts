import type { DraftGroup } from '@/utils/routineGroups'

import { create } from '@bufbuild/protobuf'
import { describe, expect, it } from 'vitest'

import { RoutineGroupSchema } from '@/proto/api/v1/routine_service_pb'
import { ExerciseMetric, ExerciseSchema, RoutineGroupMode } from '@/proto/api/v1/shared_pb'
import {
  addExerciseToGroup,
  addGroup,
  collapseToSingleGroup,
  defaultRestSeconds,
  defaultRoundRestSeconds,
  defaultRounds,
  draftGroupsFromRoutine,
  groupExerciseIds,
  isGrouped,
  removeEntry,
  newOccurrenceRestSeconds,
  removeGroup,
  reorderEntry,
  saveableGroups,
  setEntryRest,
  singleStraightGroup,
} from '@/utils/routineGroups'

const exercise = (id: string) => create(ExerciseSchema, { id, name: id })

// One exercise where a group trains it, and the rest it takes there.
const trains = (id: string, restSeconds = defaultRestSeconds) => ({
  exercise: exercise(id),
  restSeconds,
})

const entryKey = (groups: readonly DraftGroup[], groupIndex: number, position: number) =>
  groups[groupIndex].entries[position].key

/** One straight group and one circuit, each holding the exercises named. */
const twoGroups = (first: string[], second: string[]) => {
  const groups = addGroup(singleStraightGroup(first))
  return second.reduce(
    (current, exerciseId) => addExerciseToGroup(current, groups[1].id, exercise(exerciseId)),
    groups,
  )
}

describe('singleStraightGroup', () => {
  it('holds every exercise in one straight-sets group', () => {
    const groups = singleStraightGroup(['a', 'b'])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.mode).toBe('straight')
    expect(groupExerciseIds(groups)).toEqual(['a', 'b'])
  })

  it('starts empty when a routine is being built from nothing', () => {
    expect(groupExerciseIds(singleStraightGroup())).toEqual([])
  })

  // Only a routine saved before grouping arrives as bare IDs, and it never
  // recorded what each of them rests for either.
  it('rests every exercise for the default', () => {
    expect(singleStraightGroup(['a'])[0]?.entries[0]?.restSeconds).toBe(defaultRestSeconds)
  })
})

describe('newOccurrenceRestSeconds', () => {
  it('is the default for a conventional lift', () => {
    expect(
      newOccurrenceRestSeconds(
        create(ExerciseSchema, { metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS] }),
      ),
    ).toBe(defaultRestSeconds)
  })

  // Held against the clock, so it is one continuous effort rather than a set to
  // recover from: a plank picked into a routine starts with no timer.
  it('is no rest at all for an exercise measured by time', () => {
    expect(
      newOccurrenceRestSeconds(create(ExerciseSchema, { metrics: [ExerciseMetric.TIME] })),
    ).toBe(0)
    expect(
      newOccurrenceRestSeconds(
        create(ExerciseSchema, { metrics: [ExerciseMetric.DISTANCE, ExerciseMetric.TIME] }),
      ),
    ).toBe(0)
  })
})

describe('collapseToSingleGroup', () => {
  it('keeps the exercises in order and the rest each of them takes', () => {
    const grouped = twoGroups(['a'], ['b'])
    const withRest = setEntryRest(grouped, entryKey(grouped, 1, 0), 15)

    const collapsed = collapseToSingleGroup(withRest)
    expect(collapsed).toHaveLength(1)
    expect(collapsed[0]?.mode).toBe('straight')
    expect(collapsed[0]?.entries.map((entry) => entry.restSeconds)).toEqual([
      defaultRestSeconds,
      15,
    ])
  })

  // Two groups can each train it; one block trains it once.
  it('trains an exercise once however many groups named it', () => {
    expect(groupExerciseIds(collapseToSingleGroup(twoGroups(['a', 'b'], ['a'])))).toEqual([
      'a',
      'b',
    ])
  })
})

describe('draftGroupsFromRoutine', () => {
  it('reads the groups a routine came back with, keeping their settings', () => {
    const groups = draftGroupsFromRoutine(
      [
        create(RoutineGroupSchema, {
          id: 'group-1',
          mode: RoutineGroupMode.STRAIGHT,
          exercises: [trains('a', 180)],
        }),
        create(RoutineGroupSchema, {
          id: 'group-2',
          mode: RoutineGroupMode.CIRCUIT,
          restBetweenExercisesSeconds: 15,
          restBetweenRoundsSeconds: 90,
          rounds: 3,
          exercises: [trains('a'), trains('b')],
        }),
      ],
      ['a', 'a', 'b'],
    )

    expect(groups).toHaveLength(2)
    expect(groups[1]).toMatchObject({
      mode: 'circuit',
      restBetweenExercisesSeconds: 15,
      restBetweenRoundsSeconds: 90,
      rounds: 3,
    })
    // The same exercise in two groups is two entries, each with its own key.
    expect(groupExerciseIds(groups)).toEqual(['a', 'a', 'b'])
    expect(entryKey(groups, 0, 0)).not.toBe(entryKey(groups, 1, 0))
    // The rest the routine gave each occurrence comes back with it.
    expect(groups[0]?.entries[0]?.restSeconds).toBe(180)
    expect(groups[1]?.entries[0]?.restSeconds).toBe(defaultRestSeconds)
  })

  it('falls back to one straight group for a routine saved before grouping', () => {
    const groups = draftGroupsFromRoutine([], ['a', 'b'])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.mode).toBe('straight')
    expect(groupExerciseIds(groups)).toEqual(['a', 'b'])
  })
})

describe('addExerciseToGroup', () => {
  it('appends to the group it names and leaves the others alone', () => {
    const groups = twoGroups(['a'], ['b'])

    expect(groupExerciseIds(groups)).toEqual(['a', 'b'])
    expect(groups[1]?.entries).toHaveLength(1)
  })

  // A plank rests for nothing wherever a routine picks it up, and a lift for
  // the default, so the field opens on the right answer rather than on a guess.
  it('starts the occurrence at the rest a new one of that exercise takes', () => {
    const plank = create(ExerciseSchema, { id: 'plank', metrics: [ExerciseMetric.TIME] })
    const groups = addExerciseToGroup(singleStraightGroup(), '', plank)
    const withPlank = addExerciseToGroup(groups, groups[0].id, plank)

    expect(withPlank[0]?.entries[0]?.restSeconds).toBe(0)
  })

  it('lets the same exercise be trained in two groups', () => {
    const groups = twoGroups(['a'], ['a'])

    expect(groupExerciseIds(groups)).toEqual(['a', 'a'])
    expect(entryKey(groups, 0, 0)).not.toBe(entryKey(groups, 1, 0))
  })

  // A group is a block of distinct work: twice in one round is a repeat nobody
  // asked for.
  it('will not hold the same exercise twice in one group', () => {
    const groups = addExerciseToGroup(singleStraightGroup(['a']), '', exercise('a'))
    const again = addExerciseToGroup(groups, groups[0].id, exercise('a'))

    expect(groupExerciseIds(again)).toEqual(['a'])
  })
})

describe('removeEntry', () => {
  it('removes one occurrence and keeps the other', () => {
    const groups = twoGroups(['a'], ['a'])
    const remaining = removeEntry(groups, entryKey(groups, 0, 0))

    expect(groupExerciseIds(remaining)).toEqual(['a'])
    expect(remaining[0]?.entries).toEqual([])
  })
})

describe('reorderEntry', () => {
  const groups = singleStraightGroup(['a', 'b', 'c'])
  const groupId = groups[0].id

  it('puts the exercise where it was dropped', () => {
    expect(groupExerciseIds(reorderEntry(groups, groupId, 2, 0))).toEqual(['c', 'a', 'b'])
    expect(groupExerciseIds(reorderEntry(groups, groupId, 0, 2))).toEqual(['b', 'c', 'a'])
  })

  it('leaves the order alone when it lands where it started', () => {
    expect(reorderEntry(groups, groupId, 1, 1)).toEqual(groups)
  })

  it('ignores a position no exercise is at', () => {
    expect(reorderEntry(groups, groupId, 0, 9)).toEqual(groups)
    expect(reorderEntry(groups, groupId, -1, 0)).toEqual(groups)
  })

  // Every group is dragged on its own, so a position only means anything
  // inside the group it was reported for.
  it('leaves the other groups alone', () => {
    const two = twoGroups(['a', 'b'], ['c'])

    expect(groupExerciseIds(reorderEntry(two, two[0].id, 1, 0))).toEqual(['b', 'a', 'c'])
    expect(reorderEntry(two, 'missing', 1, 0)).toEqual(two)
  })
})

describe('addGroup', () => {
  it('appends an empty circuit, since that is what a second group is for', () => {
    const groups = addGroup(singleStraightGroup(['a']))

    expect(groups).toHaveLength(2)
    expect(groups[1]).toMatchObject({
      mode: 'circuit',
      entries: [],
      restBetweenRoundsSeconds: defaultRoundRestSeconds,
      rounds: defaultRounds,
    })
    expect(groups[1]?.id).not.toBe(groups[0]?.id)
  })
})

describe('removeGroup', () => {
  it('hands the exercises to the group before it', () => {
    const groups = twoGroups(['a'], ['b'])
    const remaining = removeGroup(groups, groups[1].id)

    expect(remaining).toHaveLength(1)
    expect(groupExerciseIds(remaining)).toEqual(['a', 'b'])
  })

  it('hands them to the group after it when the first one goes', () => {
    const groups = twoGroups(['a'], ['b'])

    expect(groupExerciseIds(removeGroup(groups, groups[0].id))).toEqual(['b', 'a'])
  })

  it('refuses to remove the only group', () => {
    const groups = singleStraightGroup(['a'])

    expect(removeGroup(groups, groups[0].id)).toEqual(groups)
  })

  it('does not hand a neighbour an exercise it already trains', () => {
    const groups = twoGroups(['a'], ['a', 'b'])

    expect(groupExerciseIds(removeGroup(groups, groups[1].id))).toEqual(['a', 'b'])
  })
})

describe('saveableGroups', () => {
  it('drops the empty ones and pulls the settings into range', () => {
    const groups = addGroup(singleStraightGroup(['a']))
    const saved = saveableGroups([
      { ...groups[0], restBetweenRoundsSeconds: 90 },
      { ...groups[1], restBetweenExercisesSeconds: 99999 },
    ])

    expect(saved).toHaveLength(1)
    // Straight sets rest for as long as the exercise says, whatever a stale
    // circuit setting is still carrying.
    expect(saved[0]?.restBetweenRoundsSeconds).toBe(0)
  })

  it('pulls the rests of a circuit back into the range the API takes', () => {
    const groups = addGroup(singleStraightGroup(['a']))
    const circuit = { ...groups[1], entries: groups[0].entries, restBetweenRoundsSeconds: 99999 }

    expect(saveableGroups([circuit])[0]?.restBetweenRoundsSeconds).toBe(3600)
  })

  // A straight block is worked once through, so a round count on one is a
  // setting the draft is holding rather than one the routine trains with.
  it('drops the round count of a straight group', () => {
    const groups = singleStraightGroup(['a']).map((group) => ({ ...group, rounds: 3 }))

    expect(saveableGroups(groups)[0]?.rounds).toBe(0)
  })

  it('pulls the round count of a circuit back into the range the API takes', () => {
    const groups = addGroup(singleStraightGroup(['a']))
    const entries = groups[0].entries

    expect(saveableGroups([{ ...groups[1], entries, rounds: 999 }])[0]?.rounds).toBe(99)
    expect(saveableGroups([{ ...groups[1], entries, rounds: -1 }])[0]?.rounds).toBe(0)
  })

  it("keeps a straight group's per-exercise rests, pulled into range", () => {
    const groups = singleStraightGroup(['a', 'b'])
    const withRests = setEntryRest(
      setEntryRest(groups, entryKey(groups, 0, 0), 99999),
      entryKey(groups, 0, 1),
      0,
    )

    expect(saveableGroups(withRests)[0]?.entries.map((entry) => entry.restSeconds)).toEqual([
      3600, 0,
    ])
  })

  // A circuit rests between exercises and between rounds, so a set rest has
  // nowhere to go there — it travels anyway, so switching back restores it.
  it("keeps a circuit's per-exercise rests, which it has nowhere to take", () => {
    const groups = singleStraightGroup(['a'])
    const withRest = setEntryRest(groups, entryKey(groups, 0, 0), 180)
    const asCircuit = withRest.map((group) => ({ ...group, mode: 'circuit' as const }))

    expect(saveableGroups(asCircuit)[0]?.entries[0]?.restSeconds).toBe(180)
  })
})

describe('isGrouped', () => {
  it('is false for the single straight group every routine starts with', () => {
    expect(isGrouped(singleStraightGroup(['a', 'b']))).toBe(false)
  })

  it('is true once there is a second group or a circuit', () => {
    expect(isGrouped(addGroup(singleStraightGroup(['a'])))).toBe(true)
    expect(isGrouped([{ ...singleStraightGroup(['a'])[0], mode: 'circuit' }])).toBe(true)
  })
})
