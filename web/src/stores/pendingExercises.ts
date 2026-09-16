import type { Exercise } from '@/proto/api/v1/shared_pb'
import type { PendingMutation } from '@/stores/mutationQueue'

import { create, fromJson, type JsonValue } from '@bufbuild/protobuf'
import { useMemo } from 'react'

import { ExerciseService } from '@/proto/api/v1/exercise_service_pb'
import { ExerciseSchema } from '@/proto/api/v1/shared_pb'
import { queueKey, useMutationQueueStore } from '@/stores/mutationQueue'

const createExerciseKey = queueKey(ExerciseService.method.createExercise)

/**
 * The exercises created on this device that the backend has not stored yet.
 *
 * They are read back out of the queue rather than kept a second time: an entry
 * leaves the queue only once the server has the exercise, which is also when
 * the library starts returning it. An entry with no id names nothing a routine
 * or a workout could reference, so it is left to sync in silence.
 */
const queuedExercises = (pending: readonly PendingMutation[]): Exercise[] =>
  pending
    .filter((entry) => entry.method === createExerciseKey)
    .flatMap((entry) => {
      try {
        const request = fromJson(
          ExerciseService.method.createExercise.input,
          JSON.parse(entry.request) as JsonValue,
        )
        if (!request.id) return []

        return [
          create(ExerciseSchema, {
            id: request.id,
            name: request.name,
            tags: request.tags,
            metrics: request.metrics,
          }),
        ]
      } catch {
        // A queue written by another build is still the queue: an entry this
        // one cannot read costs the library a row, not the screen.
        return []
      }
    })

/**
 * The library as this device knows it: what the backend returned, plus the
 * exercises still waiting to reach it.
 *
 * A pending exercise carries the id it will be stored under, so one that has
 * synced since the page was fetched appears once rather than twice, and
 * anything already referencing it needs no remapping.
 */
export const useExercisesWithPending = (fetched: readonly Exercise[]): Exercise[] => {
  const pending = useMutationQueueStore((state) => state.pending)

  return useMemo(() => {
    const queued = queuedExercises(pending)
    if (!queued.length) return [...fetched]

    const stored = new Set(fetched.map((exercise) => exercise.id))
    return [...queued.filter((exercise) => !stored.has(exercise.id)), ...fetched]
  }, [fetched, pending])
}
