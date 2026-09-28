import { Capacitor, registerPlugin } from '@capacitor/core'

/** A gym workout as the iOS Lock Screen shows it; every clock in milliseconds since 1970. */
export interface LiveWorkout {
  /** The draft it belongs to, so ending one leaves another alone. */
  key: string
  name: string
  exercise: string
  startedAt: number
  /** Where the running rest ends, and how long it was; unset between rests. */
  restEndsAt?: number
  restSeconds?: number
  /** The Lock Screen has no message catalogue, so every word arrives translated. */
  labels: { elapsed: string; rest: string; stopped: string }
  /** The route a tap on the Lock Screen opens. */
  path: string
}

interface WorkoutActivityPlugin {
  show(workout: LiveWorkout): Promise<void>
  end(options: { key: string }): Promise<void>
}

// Registered on first use, so a browser never registers it at all.
let registered: WorkoutActivityPlugin | undefined
const plugin = () => (registered ??= registerPlugin<WorkoutActivityPlugin>('WorkoutActivity'))

// Run in the order asked for: an end overtaken by the show before it would
// leave a finished workout on the Lock Screen.
let bridge: Promise<unknown> = Promise.resolve()

// Only iOS has Live Activities; Android's ongoing notification is its own story.
const enqueue = (step: () => Promise<unknown>): void => {
  if (Capacitor.getPlatform() !== 'ios') return

  bridge = bridge.then(step).catch((error: unknown) => {
    console.warn('workout Live Activity unavailable', error)
  })
}

/** Shows the workout on the Lock Screen, raising it the first time. */
export const showWorkoutActivity = (workout: LiveWorkout): void => {
  enqueue(() => plugin().show(workout))
}

/** Takes the draft's workout off the Lock Screen, if it is there. */
export const endWorkoutActivity = (key: string): void => {
  enqueue(() => plugin().end({ key }))
}
