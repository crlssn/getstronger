import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', () => ({ listWorkouts: vi.fn() }))

import { listWorkouts } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'
import { selectLastPerformedFor, selectRoutineLastPerformedFor, useActivityStore } from './activity'

const listWorkoutsMock = vi.mocked(listWorkouts)

const store = () => useActivityStore.getState()

const now = new Date('2026-08-14T12:00:00Z')
const secondsAt = (iso: string) => BigInt(Math.floor(Date.parse(iso) / 1000))

type StubWorkout = {
  finishedAt?: { seconds: bigint }
  routineId?: string
  exerciseSets?: Array<{ exercise?: { id: string } }>
}

const pageOf = (workouts: StubWorkout[], nextPageToken = new Uint8Array(0)) =>
  ({ pagination: { nextPageToken }, workouts }) as never

const workout = (finishedIso: string, routineId: string, exerciseIds: string[]): StubWorkout => ({
  finishedAt: { seconds: secondsAt(finishedIso) },
  routineId,
  exerciseSets: exerciseIds.map((id) => ({ exercise: { id } })),
})

describe('activity store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    useAuthStore.setState({ userId: 'user-id', accessToken: 'token' })
    useActivityStore.setState({
      exerciseLastPerformed: {},
      routineLastPerformed: {},
      loaded: false,
      failed: false,
    })
    listWorkoutsMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('records when each exercise and routine was last performed', async () => {
    listWorkoutsMock.mockResolvedValue(
      pageOf([workout('2026-08-13T10:00:00Z', 'routine-1', ['bench', 'squat'])]),
    )

    await store().load()

    expect(selectLastPerformedFor(store(), 'bench')?.toISODate()).toBe('2026-08-13')
    expect(selectRoutineLastPerformedFor(store(), 'routine-1')?.toISODate()).toBe('2026-08-13')
  })

  // Workouts arrive newest first, so the first sighting of an exercise is the
  // most recent one.
  test('keeps the most recent time an exercise was performed', async () => {
    listWorkoutsMock.mockResolvedValue(
      pageOf([
        workout('2026-08-13T10:00:00Z', 'routine-1', ['bench']),
        workout('2026-08-01T10:00:00Z', 'routine-1', ['bench']),
      ]),
    )

    await store().load()

    expect(selectLastPerformedFor(store(), 'bench')?.toISODate()).toBe('2026-08-13')
  })

  test('has nothing to say about an exercise never performed', async () => {
    listWorkoutsMock.mockResolvedValue(pageOf([]))

    await store().load()

    expect(selectLastPerformedFor(store(), 'never-done')).toBeUndefined()
    expect(selectRoutineLastPerformedFor(store(), 'never-run')).toBeUndefined()
  })

  // Quick workouts carry no routine, as does anything logged before routines
  // were linked to workouts.
  test('ignores a workout with no routine', async () => {
    listWorkoutsMock.mockResolvedValue(
      pageOf([
        {
          finishedAt: { seconds: secondsAt('2026-08-13T10:00:00Z') },
          exerciseSets: [{ exercise: { id: 'bench' } }],
        },
      ]),
    )

    await store().load()

    expect(selectLastPerformedFor(store(), 'bench')?.toISODate()).toBe('2026-08-13')
    expect(store().routineLastPerformed).toEqual({})
  })

  test('stops paging once it reaches workouts older than a month', async () => {
    listWorkoutsMock
      .mockResolvedValueOnce(
        pageOf([workout('2026-06-01T10:00:00Z', 'routine-1', ['bench'])], new Uint8Array([1])),
      )
      .mockResolvedValue(pageOf([]))

    await store().load()

    expect(listWorkoutsMock).toHaveBeenCalledTimes(1)
  })

  test('keeps the previous data when a page fails', async () => {
    listWorkoutsMock.mockResolvedValue(
      pageOf([workout('2026-08-13T10:00:00Z', 'routine-1', ['bench'])]),
    )
    await store().load()

    store().reset()
    listWorkoutsMock.mockResolvedValue(undefined)
    await store().load()

    expect(store().failed).toBe(true)
    expect(selectLastPerformedFor(store(), 'bench')?.toISODate()).toBe('2026-08-13')
  })

  test('caches for the session and refetches after a reset', async () => {
    listWorkoutsMock.mockResolvedValue(pageOf([]))

    await store().load()
    await store().load()
    expect(listWorkoutsMock).toHaveBeenCalledTimes(1)

    store().reset()
    await store().load()
    expect(listWorkoutsMock).toHaveBeenCalledTimes(2)
  })

  test('shares one fetch between concurrent callers', async () => {
    listWorkoutsMock.mockResolvedValue(pageOf([]))

    await Promise.all([store().load(), store().load()])

    expect(listWorkoutsMock).toHaveBeenCalledTimes(1)
  })

  test('does nothing while signed out', async () => {
    useAuthStore.setState({ userId: '', accessToken: '' })

    await store().load()

    expect(listWorkoutsMock).not.toHaveBeenCalled()
  })
})
