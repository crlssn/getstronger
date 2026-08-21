import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', () => ({ listWorkouts: vi.fn() }))

import { listWorkouts } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'
import { chartRangeDays, useProgressStore } from './progress'

const listWorkoutsMock = vi.mocked(listWorkouts)

const store = () => useProgressStore.getState()

const secondsAt = (iso: string) => BigInt(Math.floor(Date.parse(iso) / 1000))

const pageOf = (isoDates: string[], nextPageToken = new Uint8Array(0)) =>
  ({
    pagination: { nextPageToken },
    workouts: isoDates.map((iso) => ({ finishedAt: { seconds: secondsAt(iso) } })),
  }) as never

describe('progress store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-14T12:00:00Z'))
    useAuthStore.setState({ userId: 'user-id', accessToken: 'token' })
    useProgressStore.setState({ workouts: [], loaded: false, failed: false })
    listWorkoutsMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('collects the workouts inside the chart range', async () => {
    listWorkoutsMock.mockResolvedValue(pageOf(['2026-08-13T10:00:00Z', '2026-07-01T10:00:00Z']))

    await store().load()

    expect(store().workouts).toHaveLength(2)
    expect(store().loaded).toBe(true)
  })

  // Paging past the widest range only fetches workouts no chart shows.
  test('stops at the first workout older than the chart range', async () => {
    listWorkoutsMock
      .mockResolvedValueOnce(
        pageOf(['2026-08-13T10:00:00Z', '2024-01-01T10:00:00Z'], new Uint8Array([1])),
      )
      .mockResolvedValue(pageOf([]))

    await store().load()

    expect(store().workouts).toHaveLength(1)
    expect(listWorkoutsMock).toHaveBeenCalledTimes(1)
  })

  test('asks for a full page so a year of history fits in the page budget', async () => {
    listWorkoutsMock.mockResolvedValue(pageOf([]))

    await store().load()

    expect(listWorkoutsMock).toHaveBeenCalledWith(['user-id'], expect.anything(), 100)
  })

  test('follows the page token until the range is covered', async () => {
    listWorkoutsMock
      .mockResolvedValueOnce(pageOf(['2026-08-13T10:00:00Z'], new Uint8Array([1])))
      .mockResolvedValueOnce(pageOf(['2026-08-12T10:00:00Z']))

    await store().load()

    expect(store().workouts).toHaveLength(2)
    expect(listWorkoutsMock).toHaveBeenCalledTimes(2)
  })

  test('keeps the previous workouts when a page fails', async () => {
    listWorkoutsMock.mockResolvedValue(pageOf(['2026-08-13T10:00:00Z']))
    await store().load()

    store().reset()
    listWorkoutsMock.mockResolvedValue(undefined)
    await store().load()

    expect(store().failed).toBe(true)
    expect(store().workouts).toHaveLength(1)
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

  test('charts a year', () => {
    expect(chartRangeDays).toBe(365)
  })
})
