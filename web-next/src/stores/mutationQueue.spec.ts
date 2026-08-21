// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'

vi.mock('@/http/clients', () => ({
  workoutClient: { createWorkout: vi.fn() },
}))

import { workoutClient } from '@/http/clients'
import { ExerciseService } from '@/proto/api/v1/exercise_service_pb'
import { CreateWorkoutRequestSchema, WorkoutService } from '@/proto/api/v1/workout_service_pb'
import { useConnectionStore } from '@/stores/connection'
import { startMutationQueue, useMutationQueueStore } from './mutationQueue'

const createWorkout = vi.mocked(workoutClient.createWorkout)

const networkError = () => ConnectError.from(new TypeError('Failed to fetch'))

const request = (routineId: string) => create(CreateWorkoutRequestSchema, { routineId })

const store = () => useMutationQueueStore.getState()

describe('useMutationQueueStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useMutationQueueStore.setState({ pending: [] })
    useConnectionStore.setState({ online: true, reconnectCallbacks: [] })
    createWorkout.mockReset()
  })

  test('replays queued mutations in order and empties the queue', async () => {
    store().enqueue(WorkoutService.method.createWorkout, request('routine-1'))
    store().enqueue(WorkoutService.method.createWorkout, request('routine-2'))
    createWorkout.mockResolvedValue({ workoutId: 'w1' } as never)

    await store().flush()

    expect(store().pending).toHaveLength(0)
    expect(createWorkout).toHaveBeenCalledTimes(2)
    expect(createWorkout.mock.calls[0]?.[0].routineId).toBe('routine-1')
    expect(createWorkout.mock.calls[1]?.[0].routineId).toBe('routine-2')
  })

  test('keeps the queue when the network is still unreachable', async () => {
    store().enqueue(WorkoutService.method.createWorkout, request('routine-1'))
    createWorkout.mockRejectedValue(networkError())

    await store().flush()

    expect(store().pending).toHaveLength(1)
    expect(createWorkout).toHaveBeenCalledTimes(1)
  })

  test('drops a mutation the backend rejects and continues with the rest', async () => {
    store().enqueue(WorkoutService.method.createWorkout, request('routine-bad'))
    store().enqueue(WorkoutService.method.createWorkout, request('routine-good'))
    createWorkout
      .mockRejectedValueOnce(new ConnectError('invalid', Code.InvalidArgument))
      .mockResolvedValueOnce({ workoutId: 'w2' } as never)

    await store().flush()

    expect(store().pending).toHaveLength(0)
    expect(createWorkout).toHaveBeenCalledTimes(2)
  })

  test('refuses to queue a method without a registered replay', () => {
    expect(() =>
      store().enqueue(
        ExerciseService.method.deleteExercise as never,
        request('routine-1') as never,
      ),
    ).toThrow(/not queueable/)
  })

  test('drops everything queued when asked', () => {
    store().enqueue(WorkoutService.method.createWorkout, request('routine-1'))

    store().clear()

    expect(store().pending).toHaveLength(0)
  })

  // The queue is the offline safety net, so it has to survive the reload that
  // an offline user is most likely to trigger.
  test('persists the queue across a reload', () => {
    store().enqueue(WorkoutService.method.createWorkout, request('routine-1'))

    expect(JSON.parse(localStorage.getItem('mutationQueue') ?? '{}')).toMatchObject({
      state: { pending: [{ method: 'api.v1.WorkoutService.CreateWorkout' }] },
    })
  })

  describe('startMutationQueue', () => {
    test('flushes when connectivity returns', async () => {
      startMutationQueue()
      useConnectionStore.getState().setOnline(false)
      store().enqueue(WorkoutService.method.createWorkout, request('routine-1'))
      createWorkout.mockResolvedValue({ workoutId: 'w1' } as never)

      useConnectionStore.getState().setOnline(true)

      await vi.waitFor(() => expect(store().pending).toHaveLength(0))
    })

    // Importing the store used to register this, which meant it fired in
    // whatever order the bundler resolved modules and could not be undone.
    test('does not register until it is called', async () => {
      useConnectionStore.getState().setOnline(false)
      store().enqueue(WorkoutService.method.createWorkout, request('routine-1'))
      createWorkout.mockResolvedValue({ workoutId: 'w1' } as never)

      useConnectionStore.getState().setOnline(true)
      await Promise.resolve()

      expect(store().pending).toHaveLength(1)
      expect(createWorkout).not.toHaveBeenCalled()
    })
  })
})
