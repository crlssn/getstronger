import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { listWorkouts } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'
import { useStreakStore } from '@/stores/streak'

vi.mock('@/http/requests', () => ({ listWorkouts: vi.fn() }))

const listWorkoutsMock = vi.mocked(listWorkouts)

describe('streak store', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-08-14T12:00:00Z'))
    setActivePinia(createPinia())
    useAuthStore().userId = 'user-id'
    listWorkoutsMock.mockReset()
  })

  test('counts every workout in each displayed week', async () => {
    listWorkoutsMock.mockResolvedValue({
      pagination: { nextPageToken: new Uint8Array(0) },
      workouts: [
        { finishedAt: { seconds: 1_786_662_000n } },
        { finishedAt: { seconds: 1_786_575_600n } },
        { finishedAt: { seconds: 1_786_057_200n } },
      ],
    } as never)

    const store = useStreakStore()
    await store.load()

    expect(store.weekWorkoutCounts).toEqual({ '2026-32': 1, '2026-33': 2 })
    expect(store.streak).toBe(2)
    expect(store.thisWeekLogged).toBe(true)
  })
})
