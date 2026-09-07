import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { openSessionPhases } from '@/utils/timedCircuit'
import { TimedCircuitWeb } from './timedCircuitWeb'

const fix = (timestamp: number, longitude: number): GeolocationPosition =>
  ({
    timestamp,
    coords: { latitude: 0, longitude, accuracy: 5 },
  }) as GeolocationPosition

const denial = { code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError

let watchers: {
  success: PositionCallback
  failure: PositionErrorCallback
}[] = []

describe('the browser recorder', () => {
  beforeEach(() => {
    watchers = []
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    vi.stubGlobal('navigator', {
      geolocation: {
        watchPosition: (success: PositionCallback, failure: PositionErrorCallback) => {
          watchers.push({ success, failure })
          return watchers.length
        },
        clearWatch: vi.fn(),
      },
    })
  })

  afterEach(async () => {
    await TimedCircuitWeb.clear({ key: 'athlete' })
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const open = () =>
    TimedCircuitWeb.start({
      key: 'athlete',
      phases: openSessionPhases('Bike commute', 'Recording Bike commute', 'bike'),
      locale: 'en',
      volume: 1,
    })

  it('records an open session until it is finished, excluding paused movement', async () => {
    const started = open()
    watchers[0].success(fix(1_000_000, 0))
    await started

    vi.setSystemTime(1_030_000)
    watchers[0].success(fix(1_030_000, 0.0005))
    await TimedCircuitWeb.pause({ key: 'athlete' })

    // A fix that lands while the session is paused is not part of the route.
    vi.setSystemTime(1_060_000)
    watchers[0].success(fix(1_060_000, 0.005))
    await TimedCircuitWeb.resume({ key: 'athlete' })

    vi.setSystemTime(1_090_000)
    const running = await TimedCircuitWeb.read({ key: 'athlete' })
    expect(running.recording?.endedAt).toBeUndefined()
    expect(running.recording?.points).toHaveLength(2)

    await TimedCircuitWeb.finish({ key: 'athlete' })
    const { recording } = await TimedCircuitWeb.read({ key: 'athlete' })
    expect(recording?.endedAt).toBe(1_090_000)
    expect(recording?.pauses).toEqual([{ startedAt: 1_030_000, endedAt: 1_060_000 }])
  })

  // Nothing here speaks, so the level is taken and dropped rather than
  // refused: the screen is the same one the phones render.
  it('takes a volume it has no announcement to apply it to', async () => {
    const started = open()
    watchers[0].success(fix(1_000_000, 0))
    await started

    await expect(TimedCircuitWeb.setVolume({ key: 'athlete', volume: 0 })).resolves.toBeUndefined()
  })

  it('refuses a session another one is already recording, and answers only its own key', async () => {
    const started = open()
    watchers[0].success(fix(1_000_000, 0))
    await started

    await expect(open()).rejects.toThrow()
    expect(await TimedCircuitWeb.read({ key: 'someone-else' })).toEqual({})
  })

  it('reports a refusal of location rather than starting a session that measures nothing', async () => {
    const started = open()
    watchers[0].failure(denial)
    await expect(started).rejects.toThrow('LOCATION_DENIED')
    expect(await TimedCircuitWeb.read({ key: 'athlete' })).toEqual({})
  })

  it('rejects a prescription that is neither timed throughout nor one open interval', async () => {
    await expect(
      TimedCircuitWeb.start({
        key: 'athlete',
        phases: [
          ...openSessionPhases('Bike commute', 'Recording', 'bike'),
          { exerciseId: 'run', stationKey: 'run', name: 'Run', round: 1, instruction: 'Run' },
        ],
        locale: 'en',
        volume: 1,
      }),
    ).rejects.toThrow('Invalid prescription')
  })
})
