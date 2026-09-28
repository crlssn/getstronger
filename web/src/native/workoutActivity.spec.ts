import { beforeEach, describe, expect, test, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ platform: 'ios', show: vi.fn(), end: vi.fn() }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => bridge.platform },
  registerPlugin: () => ({ show: bridge.show, end: bridge.end }),
}))

import { endWorkoutActivity, showWorkoutActivity, type LiveWorkout } from './workoutActivity'

const workout: LiveWorkout = {
  key: 'routine-1',
  name: 'Push Day',
  exercise: 'Bench Press',
  startedAt: 1_000,
  restEndsAt: 91_000,
  restSeconds: 90,
  labels: { elapsed: 'Elapsed', rest: 'Resting', stopped: 'Stopped' },
  path: '/workouts/routine/routine-1',
}

describe('workout Live Activity', () => {
  beforeEach(() => {
    bridge.platform = 'ios'
    bridge.show.mockReset().mockResolvedValue(undefined)
    bridge.end.mockReset().mockResolvedValue(undefined)
  })

  test('hands the workout to the phone and ends it by its key, in order', async () => {
    showWorkoutActivity(workout)
    endWorkoutActivity('routine-1')

    await vi.waitFor(() => expect(bridge.end).toHaveBeenCalledWith({ key: 'routine-1' }))
    expect(bridge.show).toHaveBeenCalledWith(workout)
    expect(bridge.show.mock.invocationCallOrder[0]).toBeLessThan(
      bridge.end.mock.invocationCallOrder[0],
    )
  })

  // Android has its own ongoing notification, and a browser has no Lock Screen.
  test.each(['android', 'web'])('crosses nothing on %s', async (platform) => {
    bridge.platform = platform
    showWorkoutActivity(workout)
    endWorkoutActivity('routine-1')

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(bridge.show).not.toHaveBeenCalled()
    expect(bridge.end).not.toHaveBeenCalled()
  })
})
