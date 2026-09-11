import type { DraftGroup, IntervalRole } from '@/utils/routineGroups'

import { create } from '@bufbuild/protobuf'
import { describe, expect, it } from 'vitest'

import {
  RoutineExerciseTracking,
  RoutineGroupSchema,
} from '@/proto/api/v1/routine_service_pb'
import { ExerciseSchema, RoutineGroupMode, RoutineGroupRole } from '@/proto/api/v1/shared_pb'
import {
  addExerciseToGroup,
  addGroup,
  defaultDistanceMeters,
  defaultHoldSeconds,
  defaultRestSeconds,
  defaultRoundRestSeconds,
  defaultRounds,
  defaultSets,
  distanceStepMeters,
  draftGroupsFromRoutine,
  groupExerciseIds,
  groupLetter,
  intervalPartOf,
  moveEntry,
  newBlock,
  plannedIntervals,
  plannedSeconds,
  removeEntry,
  removeGroup,
  reorderEntry,
  saveableGroups,
  singleStraightGroup,
  startingBlocks,
  withEntry,
  withGroup,
} from '@/utils/routineGroups'

const exercise = (id: string) => create(ExerciseSchema, { id, name: id })

/** The names the Intervals shape gives its three parts. */
const intervalTitles: Record<IntervalRole, string> = {
  warmup: 'Warm-up',
  repeat: 'Repeat',
  cooldown: 'Cool-down',
}

const entryKey = (groups: readonly DraftGroup[], block: number, position: number) =>
  groups[block].entries[position].key

/** Adds each exercise to the block at `index`, tracked however it is counted. */
const fill = (
  groups: readonly DraftGroup[],
  index: number,
  ids: string[],
  tracking: 'sets' | 'timed' | 'distance' = 'sets',
) =>
  ids.reduce(
    (current, id) => addExerciseToGroup(current, current[index].id, exercise(id), tracking),
    [...groups],
  )

describe('singleStraightGroup', () => {
  it('is one straight block holding the exercises in order', () => {
    const groups = singleStraightGroup(['a', 'b'])

    expect(groups).toHaveLength(1)
    expect(groups[0].mode).toBe('straight')
    expect(groups[0].title).toBe('')
    expect(groupExerciseIds(groups)).toEqual(['a', 'b'])
  })

  it('prescribes every exercise in sets, which is what a plain routine is', () => {
    expect(singleStraightGroup(['a'])[0].entries[0]).toMatchObject({
      tracking: 'sets',
      sets: defaultSets,
      restSeconds: defaultRestSeconds,
    })
  })
})

describe('startingBlocks', () => {
  it('lays a blank routine out as one straight block', () => {
    const blocks = startingBlocks('blank', intervalTitles)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].mode).toBe('straight')
    expect(blocks[0].entries).toHaveLength(0)
  })

  it('lays a circuit out as one block that goes round', () => {
    const blocks = startingBlocks('circuit', intervalTitles)

    expect(blocks).toHaveLength(1)
    expect(blocks[0].mode).toBe('circuit')
    expect(blocks[0].rounds).toBe(defaultRounds)
  })

  it('names the three parts of an interval routine and gives them their roles', () => {
    const blocks = startingBlocks('intervals', intervalTitles)

    expect(blocks.map((block) => block.title)).toEqual(['Warm-up', 'Repeat', 'Cool-down'])
    // The editor never shows a role, but a live session reads one to number its
    // intervals, so the shape writes both.
    expect(blocks.map((block) => block.role)).toEqual(['warmup', 'repeat', 'cooldown'])
  })

  it('repeats the middle part alone, and ends it an exercise early', () => {
    const blocks = startingBlocks('intervals', intervalTitles)
    const repeat = intervalPartOf(blocks, 'repeat')

    expect(repeat?.mode).toBe('circuit')
    expect(repeat?.rounds).toBe(defaultRounds)
    expect(repeat?.skipLastOnFinalRound).toBe(true)
    // A warm-up and a cool-down are worked once through, which is a straight
    // block rather than a circuit that goes round once.
    expect(intervalPartOf(blocks, 'warmup')?.mode).toBe('straight')
    expect(intervalPartOf(blocks, 'cooldown')?.skipLastOnFinalRound).toBe(false)
  })
})

describe('draftGroupsFromRoutine', () => {
  it('reads a routine saved before grouping as one straight block', () => {
    expect(groupExerciseIds(draftGroupsFromRoutine([], ['a', 'b']))).toEqual(['a', 'b'])
  })

  it('keeps what each block is called and how it runs', () => {
    const groups = draftGroupsFromRoutine(
      [
        create(RoutineGroupSchema, {
          title: 'Warm-up',
          mode: RoutineGroupMode.STRAIGHT,
          role: RoutineGroupRole.WARMUP,
          exercises: [{ exercise: exercise('a') }],
        }),
        create(RoutineGroupSchema, {
          mode: RoutineGroupMode.CIRCUIT,
          rounds: 5,
          restBetweenRoundsSeconds: 45,
          skipLastOnFinalRound: true,
          exercises: [{ exercise: exercise('b') }],
        }),
      ],
      ['a', 'b'],
    )

    expect(groups[0]).toMatchObject({ title: 'Warm-up', mode: 'straight', role: 'warmup' })
    expect(groups[1]).toMatchObject({
      title: '',
      mode: 'circuit',
      rounds: 5,
      restBetweenRoundsSeconds: 45,
      skipLastOnFinalRound: true,
    })
  })

  it('reads how each occurrence is counted', () => {
    const groups = draftGroupsFromRoutine(
      [
        create(RoutineGroupSchema, {
          exercises: [
            {
              exercise: exercise('a'),
              tracking: RoutineExerciseTracking.DISTANCE,
              targetDistanceMeters: 800,
            },
            {
              exercise: exercise('b'),
              tracking: RoutineExerciseTracking.SETS,
              sets: 5,
              restSeconds: 120,
            },
          ],
        }),
      ],
      ['a', 'b'],
    )

    expect(groups[0].entries[0]).toMatchObject({ tracking: 'distance', targetDistanceMeters: 800 })
    expect(groups[0].entries[1]).toMatchObject({ tracking: 'sets', sets: 5, restSeconds: 120 })
  })

  it('reads an occurrence saved before tracking the way it was read then', () => {
    const groups = draftGroupsFromRoutine(
      [
        create(RoutineGroupSchema, {
          exercises: [
            { exercise: exercise('a'), targetDurationSeconds: 45 },
            { exercise: exercise('b'), restSeconds: 90 },
          ],
        }),
      ],
      ['a', 'b'],
    )

    expect(groups[0].entries[0]).toMatchObject({ tracking: 'timed', targetDurationSeconds: 45 })
    expect(groups[0].entries[1]).toMatchObject({ tracking: 'sets', restSeconds: 90 })
  })

  it('offers a length rather than a zero for the prescriptions it was not saved with', () => {
    const groups = draftGroupsFromRoutine(
      [
        create(RoutineGroupSchema, {
          exercises: [
            {
              exercise: exercise('a'),
              tracking: RoutineExerciseTracking.SETS,
              sets: 4,
              restSeconds: 30,
            },
          ],
        }),
      ],
      ['a'],
    )

    // Switching this occurrence to timed or to distance hands back a length to
    // start from, which is what a new one would take.
    expect(groups[0].entries[0]).toMatchObject({
      targetDurationSeconds: defaultHoldSeconds,
      targetDistanceMeters: defaultDistanceMeters,
    })
  })
})

describe('addExerciseToGroup', () => {
  it('adds the exercise to the named block, tracked as asked', () => {
    const groups = fill(startingBlocks('blank', intervalTitles), 0, ['a'], 'timed')

    expect(groups[0].entries[0]).toMatchObject({
      exerciseId: 'a',
      tracking: 'timed',
      targetDurationSeconds: defaultHoldSeconds,
    })
  })

  it('will not train the same exercise twice inside one block', () => {
    const once = fill(startingBlocks('blank', intervalTitles), 0, ['a'])

    expect(groupExerciseIds(fill(once, 0, ['a']))).toEqual(['a'])
  })

  it('lets two blocks train the same exercise', () => {
    const blocks = fill(addGroup(startingBlocks('blank', intervalTitles)), 0, ['a'])

    expect(groupExerciseIds(fill(blocks, 1, ['a']))).toEqual(['a', 'a'])
  })
})

describe('removeEntry', () => {
  it('removes one occurrence and leaves the other one alone', () => {
    const blocks = fill(fill(addGroup(startingBlocks('blank', intervalTitles)), 0, ['a']), 1, ['a'])

    expect(groupExerciseIds(removeEntry(blocks, entryKey(blocks, 0, 0)))).toEqual(['a'])
  })
})

describe('reorderEntry', () => {
  const blocks = () => fill(startingBlocks('blank', intervalTitles), 0, ['a', 'b', 'c'])

  it('puts the exercise where it was dropped', () => {
    const current = blocks()
    expect(groupExerciseIds(reorderEntry(current, current[0].id, 0, 2))).toEqual(['b', 'c', 'a'])
  })

  it('leaves the order alone when the row did not move', () => {
    const current = blocks()
    expect(groupExerciseIds(reorderEntry(current, current[0].id, 1, 1))).toEqual(['a', 'b', 'c'])
  })

  it('ignores a position the block does not have', () => {
    const current = blocks()
    expect(groupExerciseIds(reorderEntry(current, current[0].id, 0, 9))).toEqual(['a', 'b', 'c'])
  })
})

describe('moveEntry', () => {
  const twoBlocks = () =>
    fill(fill(addGroup(startingBlocks('blank', intervalTitles)), 0, ['a', 'b']), 1, ['c'])

  it('hands a row from one block to another', () => {
    const blocks = twoBlocks()
    const moved = moveEntry(blocks, blocks[0].id, 0, blocks[1].id, 1)

    expect(moved[0].entries.map((entry) => entry.exerciseId)).toEqual(['b'])
    expect(moved[1].entries.map((entry) => entry.exerciseId)).toEqual(['c', 'a'])
  })

  it('keeps the prescription the row was dragged with', () => {
    const blocks = fill(fill(addGroup(startingBlocks('blank', intervalTitles)), 0, ['a'], 'distance'), 1, [])
    const moved = moveEntry(blocks, blocks[0].id, 0, blocks[1].id, 0)

    expect(moved[1].entries[0]).toMatchObject({ tracking: 'distance' })
  })

  it('sends a row back where a block already trains that exercise', () => {
    const blocks = fill(fill(addGroup(startingBlocks('blank', intervalTitles)), 0, ['a']), 1, ['a'])
    const moved = moveEntry(blocks, blocks[0].id, 0, blocks[1].id, 0)

    expect(groupExerciseIds(moved)).toEqual(['a', 'a'])
  })
})

describe('withGroup and withEntry', () => {
  it('changes one block and leaves the others', () => {
    const blocks = addGroup(startingBlocks('blank', intervalTitles))
    const named = withGroup(blocks, blocks[0].id, { title: 'Warm-up' })

    expect(named.map((block) => block.title)).toEqual(['Warm-up', ''])
  })

  it('changes one occurrence and leaves every other one', () => {
    const blocks = fill(startingBlocks('blank', intervalTitles), 0, ['a', 'b'])
    const changed = withEntry(blocks, entryKey(blocks, 0, 1), { sets: 8 })

    expect(changed[0].entries.map((entry) => entry.sets)).toEqual([defaultSets, 8])
  })
})

describe('addGroup and removeGroup', () => {
  it('appends an empty straight block', () => {
    const blocks = addGroup(startingBlocks('blank', intervalTitles))

    expect(blocks).toHaveLength(2)
    expect(blocks[1]).toMatchObject({ mode: 'straight', title: '', entries: [] })
  })

  it('hands a removed block\u2019s exercises to its neighbour', () => {
    const blocks = fill(fill(addGroup(startingBlocks('blank', intervalTitles)), 0, ['a']), 1, ['b'])

    expect(groupExerciseIds(removeGroup(blocks, blocks[1].id))).toEqual(['a', 'b'])
  })

  it('drops the ones the neighbour already trains, which it cannot hold twice', () => {
    const blocks = fill(fill(addGroup(startingBlocks('blank', intervalTitles)), 0, ['a']), 1, ['a'])

    expect(groupExerciseIds(removeGroup(blocks, blocks[1].id))).toEqual(['a'])
  })

  it('never removes the last block, which is the routine', () => {
    const blocks = startingBlocks('blank', intervalTitles)

    expect(removeGroup(blocks, blocks[0].id)).toHaveLength(1)
  })
})

describe('groupLetter', () => {
  it('names blocks A, B, C', () => {
    expect([0, 1, 2].map(groupLetter)).toEqual(['A', 'B', 'C'])
  })
})

describe('distanceStepMeters', () => {
  it('steps a hundred metres below a kilometre and half of one above it', () => {
    expect(distanceStepMeters(800)).toBe(100)
    expect(distanceStepMeters(1000)).toBe(500)
  })
})

describe('the planned session', () => {
  it('counts a straight block as its sets and the rests between them', () => {
    const blocks = fill(startingBlocks('blank', intervalTitles), 0, ['a'])
    const straight = withEntry(blocks, entryKey(blocks, 0, 0), { sets: 3, restSeconds: 60 })

    // Three working sets and the two rests between them.
    expect(plannedSeconds(straight)).toBe(3 * 40 + 2 * 60)
    expect(plannedIntervals(straight)).toBe(3)
  })

  it('counts a circuit as one set of each, once a round', () => {
    const blocks = fill(startingBlocks('circuit', intervalTitles), 0, ['a', 'b'], 'timed')
    const timed = withGroup(blocks, blocks[0].id, {
      rounds: 2,
      restBetweenRoundsSeconds: 30,
      entries: blocks[0].entries.map((entry) => ({ ...entry, targetDurationSeconds: 20 })),
    })

    // Two twenty-second stations, twice round, with one round rest between.
    expect(plannedSeconds(timed)).toBe(2 * (20 + 20) + 30)
    expect(plannedIntervals(timed)).toBe(4)
  })

  it('drops the interval a final round ends early, and the time it took', () => {
    const blocks = fill(startingBlocks('circuit', intervalTitles), 0, ['a', 'b'], 'timed')
    const skipping = withGroup(blocks, blocks[0].id, {
      rounds: 2,
      restBetweenRoundsSeconds: 0,
      skipLastOnFinalRound: true,
      entries: blocks[0].entries.map((entry) => ({ ...entry, targetDurationSeconds: 20 })),
    })

    expect(plannedIntervals(skipping)).toBe(3)
    // Three twenty-second stations rather than four.
    expect(plannedSeconds(skipping)).toBe(60)
  })

  it('reads a prescribed distance as the time a steady run covers it in', () => {
    const blocks = fill(startingBlocks('blank', intervalTitles), 0, ['a'], 'distance')

    // A kilometre at six minutes a kilometre.
    expect(plannedSeconds(blocks)).toBe(360)
    expect(plannedIntervals(blocks)).toBe(1)
  })

  it('plans nothing for a routine with no exercises', () => {
    expect(plannedSeconds(startingBlocks('intervals', intervalTitles))).toBe(0)
    expect(plannedIntervals(startingBlocks('intervals', intervalTitles))).toBe(0)
  })
})

describe('saveableGroups', () => {
  it('drops the blocks holding nothing', () => {
    const blocks = fill(startingBlocks('intervals', intervalTitles), 1, ['a'], 'timed')

    expect(saveableGroups(blocks)).toHaveLength(1)
  })

  it('trims the name and keeps the role the shape wrote', () => {
    const blocks = fill(startingBlocks('blank', intervalTitles), 0, ['a'])
    const named = withGroup(blocks, blocks[0].id, { title: '  Warm-up  ', role: 'warmup' })

    expect(saveableGroups(named)[0]).toMatchObject({ title: 'Warm-up', role: 'warmup' })
  })

  it('gives a straight block no round to close and none to count', () => {
    const blocks = fill(startingBlocks('circuit', intervalTitles), 0, ['a'])
    const straight = withGroup(blocks, blocks[0].id, { mode: 'straight' })

    expect(saveableGroups(straight)[0]).toMatchObject({
      rounds: 0,
      restBetweenRoundsSeconds: 0,
      skipLastOnFinalRound: false,
    })
  })

  it('keeps an open-ended circuit open-ended', () => {
    const blocks = fill(startingBlocks('circuit', intervalTitles), 0, ['a'])
    const open = withGroup(blocks, blocks[0].id, { rounds: 0 })

    expect(saveableGroups(open)[0].rounds).toBe(0)
  })

  it('works a part of an interval routine at least once', () => {
    const blocks = fill(startingBlocks('intervals', intervalTitles), 1, ['a'], 'timed')
    const repeat = blocks.find((block) => block.role === 'repeat')!
    const open = withGroup(blocks, repeat.id, { rounds: 0 })

    expect(saveableGroups(open)[0].rounds).toBe(1)
  })

  it('pulls a prescription outside the supported range back into it', () => {
    const blocks = fill(startingBlocks('blank', intervalTitles), 0, ['a'])
    const wild = withGroup(blocks, blocks[0].id, {
      restBetweenExercisesSeconds: 99999,
      entries: [{ ...blocks[0].entries[0], sets: 99 }],
    })

    expect(saveableGroups(wild)[0].restBetweenExercisesSeconds).toBe(3600)
    expect(saveableGroups(wild)[0].entries[0].sets).toBe(20)
  })

  it('saves only the prescription an occurrence is tracked by', () => {
    const blocks = fill(startingBlocks('blank', intervalTitles), 0, ['a'], 'distance')
    const saved = saveableGroups(blocks)[0].entries[0]

    // The draft holds all three so switching between them costs nothing. The
    // row must say one thing: a run measured by distance that kept a leftover
    // thirty seconds would be guided as a thirty-second run.
    expect(saved).toMatchObject({
      tracking: 'distance',
      targetDistanceMeters: defaultDistanceMeters,
      targetDurationSeconds: 0,
      sets: 0,
      restSeconds: 0,
    })
  })
})

describe('newBlock', () => {
  it('arrives straight, resting nowhere, ready to go round if asked', () => {
    expect(newBlock()).toMatchObject({
      mode: 'straight',
      restBetweenExercisesSeconds: 0,
      restBetweenRoundsSeconds: defaultRoundRestSeconds,
      rounds: defaultRounds,
    })
  })
})
