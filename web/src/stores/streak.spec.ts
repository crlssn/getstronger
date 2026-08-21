import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', () => ({ listWorkouts: vi.fn() }))

import { listWorkouts } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'
import { useStreakStore } from './streak'

const listWorkoutsMock = vi.mocked(listWorkouts)

const store = () => useStreakStore.getState()

const finishedAt = (seconds: bigint) => ({ finishedAt: { seconds } })

const onePageOf = (workouts: Array<{ finishedAt: { seconds: bigint } }>) =>
  ({ pagination: { nextPageToken: new Uint8Array(0) }, workouts }) as never

// 2026-08-14 is a Friday in ISO week 33; 2026-08-07 falls in week 32.
const friday = 1_786_662_000n
const thursday = 1_786_575_600n
const weekBefore = 1_786_057_200n

describe('streak store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-14T12:00:00Z'))
    useAuthStore.setState({ userId: 'user-id', accessToken: 'token' })
    useStreakStore.setState({
      streak: 0,
      thisWeekLogged: false,
      weekWorkoutCounts: {},
      loaded: false,
      failed: false,
      computedForWeek: '',
    })
    listWorkoutsMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('counts every workout in each displayed week', async () => {
    listWorkoutsMock.mockResolvedValue(
      onePageOf([finishedAt(friday), finishedAt(thursday), finishedAt(weekBefore)]),
    )

    await store().load()

    expect(store().weekWorkoutCounts).toEqual({ '2026-32': 1, '2026-33': 2 })
    expect(store().streak).toBe(2)
    expect(store().thisWeekLogged).toBe(true)
  })

  // A partial fetch would understate the streak, so it reports an error rather
  // than a confident zero.
  test('reports a failure instead of a zero streak', async () => {
    listWorkoutsMock.mockResolvedValue(undefined)

    await store().load()

    expect(store().failed).toBe(true)
    expect(store().loaded).toBe(true)
    expect(store().streak).toBe(0)
  })

  test('caches for the session', async () => {
    listWorkoutsMock.mockResolvedValue(onePageOf([finishedAt(friday)]))

    await store().load()
    await store().load()

    expect(listWorkoutsMock).toHaveBeenCalledTimes(1)
  })

  test('recomputes after a reset', async () => {
    listWorkoutsMock.mockResolvedValue(onePageOf([finishedAt(friday)]))
    await store().load()

    store().reset()
    await store().load()

    expect(listWorkoutsMock).toHaveBeenCalledTimes(2)
  })

  test('retries after a failure rather than caching it', async () => {
    listWorkoutsMock.mockResolvedValueOnce(undefined)
    await store().load()

    listWorkoutsMock.mockResolvedValue(onePageOf([finishedAt(friday)]))
    await store().load()

    expect(store().failed).toBe(false)
    expect(store().streak).toBe(1)
  })

  // A tab left open over the weekend would otherwise keep showing the streak
  // it computed last week.
  test('recomputes once the week rolls over', async () => {
    listWorkoutsMock.mockResolvedValue(onePageOf([finishedAt(friday)]))
    await store().load()

    vi.setSystemTime(new Date('2026-08-18T12:00:00Z'))
    await store().load()

    expect(listWorkoutsMock).toHaveBeenCalledTimes(2)
  })

  test('shares one fetch between concurrent callers', async () => {
    listWorkoutsMock.mockResolvedValue(onePageOf([finishedAt(friday)]))

    await Promise.all([store().load(), store().load(), store().load()])

    expect(listWorkoutsMock).toHaveBeenCalledTimes(1)
  })

  test('does nothing while signed out', async () => {
    useAuthStore.setState({ userId: '', accessToken: '' })

    await store().load()

    expect(listWorkoutsMock).not.toHaveBeenCalled()
  })
})
