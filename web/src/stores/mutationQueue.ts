import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  fromJson,
  toJson,
  type DescMethodUnary,
  type JsonValue,
  type Message,
} from '@bufbuild/protobuf'

import { workoutClient } from '@/http/clients'
import { isConnectivityError } from '@/http/offlineCache'
import { useConnectionStore } from '@/stores/connection'
import { WorkoutService, type CreateWorkoutRequest } from '@/proto/api/v1/workout_service_pb'

// Mutations that may be queued while offline and replayed on reconnect.
// Making another method offline-capable is one entry here: how its request is
// stored as a JSON string, and how a stored request goes out through the
// regular client. The schemas stay concrete so the compiler never has to
// reason about serializing arbitrary messages.
type Replayer = {
  serialize: (message: Message) => string
  replay: (request: string) => Promise<unknown>
}

const replayers: Record<string, Replayer> = {
  [`${WorkoutService.typeName}.CreateWorkout`]: {
    serialize: (message) =>
      JSON.stringify(toJson(WorkoutService.method.createWorkout.input, message as CreateWorkoutRequest)),
    replay: (request) =>
      workoutClient.createWorkout(
        fromJson(WorkoutService.method.createWorkout.input, JSON.parse(request) as JsonValue),
      ),
  },
}

const keyFor = (method: DescMethodUnary) => `${method.parent.typeName}.${method.name}`

// The request stays a JSON string rather than a JsonValue: recursive JSON
// types overflow the compiler once Vue's ref unwrapping expands them.
type PendingMutation = {
  method: string
  request: string
  queuedAt: string
}

/**
 * Holds mutations made while offline and replays them, oldest first, once the
 * backend is reachable again. The queue survives reloads via persistence.
 */
export const useMutationQueueStore = defineStore(
  'mutationQueue',
  () => {
    const pending = ref<PendingMutation[]>([])
    let flushing = false

    // Typed against the descriptor base types: the replayer registry, not the
    // signature, is what guarantees a queued request can be replayed.
    const enqueue = (method: DescMethodUnary, message: Message) => {
      const key = keyFor(method)
      const replayer = replayers[key]
      if (!replayer) throw new Error(`method ${key} is not queueable`)

      pending.value.push({
        method: key,
        request: replayer.serialize(message),
        queuedAt: new Date().toISOString(),
      })
    }

    const flush = async () => {
      if (flushing) return
      flushing = true
      try {
        while (pending.value.length) {
          const entry = pending.value[0]
          const replayer = replayers[entry.method]
          try {
            if (replayer) await replayer.replay(entry.request)
          } catch (error) {
            // Still unreachable: keep everything for the next reconnect. Any
            // other failure means the backend saw and rejected this request,
            // and retrying it forever would block the rest of the queue.
            if (isConnectivityError(error)) return
            console.error('dropping queued mutation rejected by the backend', error)
          }
          pending.value.shift()
        }
      } finally {
        flushing = false
      }
    }

    /** Drops everything still queued, e.g. when the user logs out. */
    const clear = () => {
      pending.value = []
    }

    useConnectionStore().onReconnect(() => void flush())

    return { clear, enqueue, flush, pending }
  },
  {
    persist: true,
  },
)
