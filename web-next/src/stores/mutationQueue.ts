import {
  fromJson,
  toJson,
  type DescMethodUnary,
  type JsonValue,
  type Message,
} from '@bufbuild/protobuf'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { workoutClient } from '@/http/clients'
import { isConnectivityError } from '@/http/offlineCache'
import { WorkoutService, type CreateWorkoutRequest } from '@/proto/api/v1/workout_service_pb'
import { useConnectionStore } from '@/stores/connection'

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
      JSON.stringify(
        toJson(WorkoutService.method.createWorkout.input, message as CreateWorkoutRequest),
      ),
    replay: (request) =>
      workoutClient.createWorkout(
        fromJson(WorkoutService.method.createWorkout.input, JSON.parse(request) as JsonValue),
      ),
  },
}

const keyFor = (method: DescMethodUnary) => `${method.parent.typeName}.${method.name}`

// The request stays a JSON string rather than a JsonValue, so a recursive JSON
// type never has to be carried through the store's own types.
type PendingMutation = {
  method: string
  request: string
  queuedAt: string
}

interface MutationQueueState {
  pending: PendingMutation[]
  enqueue: (method: DescMethodUnary, message: Message) => void
  flush: () => Promise<void>
  clear: () => void
}

// A mutex rather than state: a flush in progress is not something to render.
let flushing = false

/**
 * Holds mutations made while offline and replays them, oldest first, once the
 * backend is reachable again. The queue survives reloads via persistence.
 */
export const useMutationQueueStore = create<MutationQueueState>()(
  persist(
    (set, get) => ({
      pending: [],

      // Typed against the descriptor base types: the replayer registry, not the
      // signature, is what guarantees a queued request can be replayed.
      enqueue: (method, message) => {
        const key = keyFor(method)
        const replayer = replayers[key]
        if (!replayer) throw new Error(`method ${key} is not queueable`)

        set({
          pending: [
            ...get().pending,
            {
              method: key,
              request: replayer.serialize(message),
              queuedAt: new Date().toISOString(),
            },
          ],
        })
      },

      flush: async () => {
        if (flushing) return
        flushing = true
        try {
          while (get().pending.length) {
            const entry = get().pending[0]
            if (!entry) break

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
            set({ pending: get().pending.slice(1) })
          }
        } finally {
          flushing = false
        }
      },

      /** Drops everything still queued, e.g. when the user logs out. */
      clear: () => set({ pending: [] }),
    }),
    {
      name: 'mutationQueue',
      partialize: ({ pending }) => ({ pending }),
    },
  ),
)

/**
 * Replays the queue whenever connectivity returns.
 *
 * Called by the app at mount rather than run on import: a store that wires
 * itself into another store as a side effect of being imported is wiring that
 * fires in whatever order the bundler happens to resolve modules, and that
 * cannot be undone in a test.
 */
export const startMutationQueue = () => {
  useConnectionStore.getState().onReconnect(() => void useMutationQueueStore.getState().flush())
}
