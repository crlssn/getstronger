import type { DraftGroup } from '@/utils/routineGroups'

import { create } from '@bufbuild/protobuf'
import { describe, expect, it } from 'vitest'

import { RoutineGroupMode, RoutineGroupSchema } from '@/proto/api/v1/routine_service_pb'
import { ExerciseSchema } from '@/proto/api/v1/shared_pb'
import {
  addExerciseToGroup,
  addGroup,
  defaultRoundRestSeconds,
  draftGroupsFromRoutine,
  groupExerciseIds,
  isGrouped,
  moveEntryToGroup,
  moveEntryWithinGroup,
  removeEntry,
  removeGroup,
  saveableGroups,
  singleStraightGroup,
} from '@/utils/routineGroups'

const exercise = (id: string) => create(ExerciseSchema, { id, name: id })

const entryKey = (groups: readonly DraftGroup[], groupIndex: number, position: number) =>
  groups[groupIndex]!.entries[position]!.key

/** One straight group and one circuit, each holding the exercises named. */
const twoGroups = (first: string[], second: string[]) => {
  const groups = addGroup(singleStraightGroup(first))
  return second.reduce(
    (current, exerciseId) => addExerciseToGroup(current, groups[1]!.id, exerciseId),
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

  // Collapsing two groups into one block can name the same exercise twice.
  it('trains an exercise once however many times it was named', () => {
    expect(groupExerciseIds(singleStraightGroup(['a', 'b', 'a']))).toEqual(['a', 'b'])
  })
})

describe('draftGroupsFromRoutine', () => {
  it('reads the groups a routine came back with, keeping their settings', () => {
    const groups = draftGroupsFromRoutine(
      [
        create(RoutineGroupSchema, {
          id: 'group-1',
          mode: RoutineGroupMode.STRAIGHT,
          exercises: [exercise('a')],
        }),
        create(RoutineGroupSchema, {
          id: 'group-2',
          mode: RoutineGroupMode.CIRCUIT,
          restBetweenExercisesSeconds: 15,
          restBetweenRoundsSeconds: 90,
          exercises: [exercise('a'), exercise('b')],
        }),
      ],
      ['a', 'a', 'b'],
    )

    expect(groups).toHaveLength(2)
    expect(groups[1]).toMatchObject({
      mode: 'circuit',
      restBetweenExercisesSeconds: 15,
      restBetweenRoundsSeconds: 90,
    })
    // The same exercise in two groups is two entries, each with its own key.
    expect(groupExerciseIds(groups)).toEqual(['a', 'a', 'b'])
    expect(entryKey(groups, 0, 0)).not.toBe(entryKey(groups, 1, 0))
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

  it('lets the same exercise be trained in two groups', () => {
    const groups = twoGroups(['a'], ['a'])

    expect(groupExerciseIds(groups)).toEqual(['a', 'a'])
    expect(entryKey(groups, 0, 0)).not.toBe(entryKey(groups, 1, 0))
  })

  // A group is a block of distinct work: twice in one round is a repeat nobody
  // asked for.
  it('will not hold the same exercise twice in one group', () => {
    const groups = addExerciseToGroup(singleStraightGroup(['a']), '', 'a')
    const again = addExerciseToGroup(groups, groups[0]!.id, 'a')

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

describe('moveEntryToGroup', () => {
  it('appends the exercise to its new group and removes it from the old one', () => {
    const groups = twoGroups(['a', 'b'], [])
    const moved = moveEntryToGroup(groups, entryKey(groups, 0, 0), groups[1]!.id)

    expect(moved[0]?.entries.map((entry) => entry.exerciseId)).toEqual(['b'])
    expect(moved[1]?.entries.map((entry) => entry.exerciseId)).toEqual(['a'])
  })

  it('leaves the groups alone when the target does not exist', () => {
    const groups = singleStraightGroup(['a'])

    expect(moveEntryToGroup(groups, entryKey(groups, 0, 0), 'missing')).toEqual(groups)
  })

  it('will not move an exercise into a group that already trains it', () => {
    const groups = twoGroups(['a'], ['a'])

    expect(moveEntryToGroup(groups, entryKey(groups, 0, 0), groups[1]!.id)).toEqual(groups)
  })
})

describe('moveEntryWithinGroup', () => {
  const groups = singleStraightGroup(['a', 'b', 'c'])
  const keyOf = (position: number) => entryKey(groups, 0, position)

  it('swaps the exercise with the one before it', () => {
    expect(groupExerciseIds(moveEntryWithinGroup(groups, keyOf(1), -1))).toEqual(['b', 'a', 'c'])
  })

  it('swaps the exercise with the one after it', () => {
    expect(groupExerciseIds(moveEntryWithinGroup(groups, keyOf(1), 1))).toEqual(['a', 'c', 'b'])
  })

  it('stays put at either end', () => {
    expect(groupExerciseIds(moveEntryWithinGroup(groups, keyOf(0), -1))).toEqual(['a', 'b', 'c'])
    expect(groupExerciseIds(moveEntryWithinGroup(groups, keyOf(2), 1))).toEqual(['a', 'b', 'c'])
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
    })
    expect(groups[1]?.id).not.toBe(groups[0]?.id)
  })
})

describe('removeGroup', () => {
  it('hands the exercises to the group before it', () => {
    const groups = twoGroups(['a'], ['b'])
    const remaining = removeGroup(groups, groups[1]!.id)

    expect(remaining).toHaveLength(1)
    expect(groupExerciseIds(remaining)).toEqual(['a', 'b'])
  })

  it('hands them to the group after it when the first one goes', () => {
    const groups = twoGroups(['a'], ['b'])

    expect(groupExerciseIds(removeGroup(groups, groups[0]!.id))).toEqual(['b', 'a'])
  })

  it('refuses to remove the only group', () => {
    const groups = singleStraightGroup(['a'])

    expect(removeGroup(groups, groups[0]!.id)).toEqual(groups)
  })

  it('does not hand a neighbour an exercise it already trains', () => {
    const groups = twoGroups(['a'], ['a', 'b'])

    expect(groupExerciseIds(removeGroup(groups, groups[1]!.id))).toEqual(['a', 'b'])
  })
})

describe('saveableGroups', () => {
  it('drops the empty ones and pulls the settings into range', () => {
    const groups = addGroup(singleStraightGroup(['a']))
    const saved = saveableGroups([
      { ...groups[0]!, restBetweenRoundsSeconds: 90 },
      { ...groups[1]!, restBetweenExercisesSeconds: 99999 },
    ])

    expect(saved).toHaveLength(1)
    // Straight sets rest for as long as the exercise says, whatever a stale
    // circuit setting is still carrying.
    expect(saved[0]?.restBetweenRoundsSeconds).toBe(0)
  })

  it('pulls the rests of a circuit back into the range the API takes', () => {
    const groups = addGroup(singleStraightGroup(['a']))
    const circuit = { ...groups[1]!, entries: groups[0]!.entries, restBetweenRoundsSeconds: 99999 }

    expect(saveableGroups([circuit])[0]?.restBetweenRoundsSeconds).toBe(3600)
  })
})

describe('isGrouped', () => {
  it('is false for the single straight group every routine starts with', () => {
    expect(isGrouped(singleStraightGroup(['a', 'b']))).toBe(false)
  })

  it('is true once there is a second group or a circuit', () => {
    expect(isGrouped(addGroup(singleStraightGroup(['a'])))).toBe(true)
    expect(isGrouped([{ ...singleStraightGroup(['a'])[0]!, mode: 'circuit' }])).toBe(true)
  })
})
