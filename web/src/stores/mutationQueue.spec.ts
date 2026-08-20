// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'

vi.mock('@/http/clients', () => ({
  workoutClient: { createWorkout: vi.fn() },
}))

import { workoutClient } from '@/http/clients'
import {
  CreateWorkoutRequestSchema,
  WorkoutService,
} from '@/proto/api/v1/workout_service_pb'
import { ExerciseService } from '@/proto/api/v1/exercise_service_pb'
import { useConnectionStore } from '@/stores/connection'
import { useMutationQueueStore } from './mutationQueue'

const createWorkout = vi.mocked(workoutClient.createWorkout)

const networkError = () => ConnectError.from(new TypeError('Failed to fetch'))

const request = (routineId: string) => create(CreateWorkoutRequestSchema, { routineId })

describe('useMutationQueueStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    createWorkout.mockReset()
  })

  test('replays queued mutations in order and empties the queue', async () => {
    const store = useMutationQueueStore()
    store.enqueue(WorkoutService.method.createWorkout, request('routine-1'))
    store.enqueue(WorkoutService.method.createWorkout, request('routine-2'))
    createWorkout.mockResolvedValue({ workoutId: 'w1' } as never)

    await store.flush()

    expect(store.pending).toHaveLength(0)
    expect(createWorkout).toHaveBeenCalledTimes(2)
    expect(createWorkout.mock.calls[0][0].routineId).toBe('routine-1')
    expect(createWorkout.mock.calls[1][0].routineId).toBe('routine-2')
  })

  test('keeps the queue when the network is still unreachable', async () => {
    const store = useMutationQueueStore()
    store.enqueue(WorkoutService.method.createWorkout, request('routine-1'))
    createWorkout.mockRejectedValue(networkError())

    await store.flush()

    expect(store.pending).toHaveLength(1)
    expect(createWorkout).toHaveBeenCalledTimes(1)
  })

  test('drops a mutation the backend rejects and continues with the rest', async () => {
    const store = useMutationQueueStore()
    store.enqueue(WorkoutService.method.createWorkout, request('routine-bad'))
    store.enqueue(WorkoutService.method.createWorkout, request('routine-good'))
    createWorkout
      .mockRejectedValueOnce(new ConnectError('invalid', Code.InvalidArgument))
      .mockResolvedValueOnce({ workoutId: 'w2' } as never)

    await store.flush()

    expect(store.pending).toHaveLength(0)
    expect(createWorkout).toHaveBeenCalledTimes(2)
  })

  test('refuses to queue a method without a registered replay', () => {
    const store = useMutationQueueStore()

    expect(() =>
      store.enqueue(
        ExerciseService.method.deleteExercise as never,
        request('routine-1') as never,
      ),
    ).toThrow(/not queueable/)
  })

  test('flushes automatically when connectivity returns', async () => {
    const connectionStore = useConnectionStore()
    connectionStore.setOnline(false)
    const store = useMutationQueueStore()
    store.enqueue(WorkoutService.method.createWorkout, request('routine-1'))
    createWorkout.mockResolvedValue({ workoutId: 'w1' } as never)

    connectionStore.setOnline(true)
    await vi.waitFor(() => expect(store.pending).toHaveLength(0))
  })
})
