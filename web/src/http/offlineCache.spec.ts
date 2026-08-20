// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'

import { ExerciseService } from '@/proto/api/v1/exercise_service_pb'
import { WorkoutService } from '@/proto/api/v1/workout_service_pb'
import {
  GetExerciseRequestSchema,
  GetExerciseResponseSchema,
  ListExercisesRequestSchema,
  ListExercisesResponseSchema,
} from '@/proto/api/v1/exercise_service_pb'
import {
  CreateWorkoutRequestSchema,
  CreateWorkoutResponseSchema,
} from '@/proto/api/v1/workout_service_pb'
import { useAuthStore } from '@/stores/auth'
import { useConnectionStore } from '@/stores/connection'
import { isConnectivityError, offlineCache } from './offlineCache'

const networkError = () => ConnectError.from(new TypeError('Failed to fetch'))

const listRequest = (pageToken = new Uint8Array(0)) => ({
  stream: false,
  service: ExerciseService,
  method: ExerciseService.method.listExercises,
  message: create(ListExercisesRequestSchema, { pagination: { pageLimit: 25, pageToken } }),
  header: new Headers(),
  url: 'https://api.test/list',
})

const listResponse = (name: string) => ({
  stream: false,
  service: ExerciseService,
  method: ExerciseService.method.listExercises,
  message: create(ListExercisesResponseSchema, { exercises: [{ id: 'e1', name }] }),
  header: new Headers(),
  trailer: new Headers(),
})

const run = (req: unknown, next: (req: unknown) => Promise<unknown>): Promise<unknown> =>
  offlineCache(next as never)(req as never) as Promise<unknown>

// The jsdom build used by vitest ships without localStorage, so the cache's
// storage is stood in for by a Map with the same surface.
const storage = new Map<string, string>()
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => void storage.delete(key),
    setItem: (key: string, value: string) => void storage.set(key, value),
  },
})

describe('offlineCache', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    storage.clear()
    useAuthStore().userId = 'user-1'
  })

  test('serves the cached response when the network call fails', async () => {
    const next = vi
      .fn()
      .mockResolvedValueOnce(listResponse('Bench Press'))
      .mockRejectedValueOnce(networkError())

    await run(listRequest(), next)
    const replayed = (await run(listRequest(), next)) as {
      message: { exercises: { name: string }[] }
    }

    expect(replayed.message.exercises[0].name).toBe('Bench Press')
    expect(useConnectionStore().online).toBe(false)
  })

  test('rethrows a network failure when nothing is cached', async () => {
    const next = vi.fn().mockRejectedValue(networkError())

    await expect(run(listRequest(), next)).rejects.toThrow(ConnectError)
  })

  test('rethrows application errors without touching the cache', async () => {
    const next = vi
      .fn()
      .mockResolvedValueOnce(listResponse('Bench Press'))
      .mockRejectedValueOnce(new ConnectError('boom', Code.InvalidArgument))

    await run(listRequest(), next)

    await expect(run(listRequest(), next)).rejects.toThrow('boom')
  })

  test('caches only the first page of paginated lists', async () => {
    const secondPage = listRequest(new Uint8Array([1, 2, 3]))
    const next = vi
      .fn()
      .mockResolvedValueOnce(listResponse('Page two'))
      .mockRejectedValueOnce(networkError())

    await run(secondPage, next)

    await expect(run(secondPage, next)).rejects.toThrow(ConnectError)
  })

  test('keeps caches from different requests apart', async () => {
    const requestFor = (id: string) => ({
      ...listRequest(),
      method: ExerciseService.method.getExercise,
      message: create(GetExerciseRequestSchema, { id }),
    })
    const responseFor = (name: string) => ({
      ...listResponse(name),
      method: ExerciseService.method.getExercise,
      message: create(GetExerciseResponseSchema, { exercise: { id: name, name } }),
    })
    const next = vi
      .fn()
      .mockResolvedValueOnce(responseFor('Squat'))
      .mockResolvedValueOnce(responseFor('Deadlift'))
      .mockRejectedValue(networkError())

    await run(requestFor('a'), next)
    await run(requestFor('b'), next)

    const replayed = (await run(requestFor('a'), next)) as {
      message: { exercise: { name: string } }
    }
    expect(replayed.message.exercise.name).toBe('Squat')
  })

  test('keeps caches from different users apart', async () => {
    const next = vi
      .fn()
      .mockResolvedValueOnce(listResponse('Bench Press'))
      .mockRejectedValue(networkError())

    await run(listRequest(), next)

    useAuthStore().userId = 'user-2'
    await expect(run(listRequest(), next)).rejects.toThrow(ConnectError)
  })

  test('never serves mutations from the cache', async () => {
    const mutation = {
      ...listRequest(),
      service: WorkoutService,
      method: WorkoutService.method.createWorkout,
      message: create(CreateWorkoutRequestSchema, { routineId: 'r1' }),
    }
    const next = vi
      .fn()
      .mockResolvedValueOnce({
        ...listResponse(''),
        service: WorkoutService,
        method: WorkoutService.method.createWorkout,
        message: create(CreateWorkoutResponseSchema, { workoutId: 'w1' }),
      })
      .mockRejectedValueOnce(networkError())

    await run(mutation, next)

    await expect(run(mutation, next)).rejects.toThrow(ConnectError)
  })

  test('marks the connection online again after a successful read', async () => {
    const connectionStore = useConnectionStore()
    connectionStore.setOnline(false)
    const next = vi.fn().mockResolvedValue(listResponse('Bench Press'))

    await run(listRequest(), next)

    expect(connectionStore.online).toBe(true)
  })
})

describe('isConnectivityError', () => {
  test('recognises a failed fetch', () => {
    expect(isConnectivityError(networkError())).toBe(true)
  })

  test('recognises an unavailable backend', () => {
    expect(isConnectivityError(new ConnectError('down', Code.Unavailable))).toBe(true)
  })

  test('rejects application errors', () => {
    expect(isConnectivityError(new ConnectError('bad', Code.InvalidArgument))).toBe(false)
    expect(isConnectivityError(new Error('other'))).toBe(false)
  })
})
