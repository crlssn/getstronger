import type { Phase } from '@/utils/timedCircuit'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { playCue } from '@/native/cueTone'
import { openSessionPhases } from '@/utils/timedCircuit'
import { TimedCircuitWeb } from './timedCircuitWeb'

vi.mock('@/native/cueTone', () => ({ playCue: vi.fn() }))

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
    vi.mocked(playCue).mockClear()
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
      cueLeadSeconds: 10,
    })

  const interval = (name: string, durationSeconds: number): Phase => ({
    exerciseId: 'run',
    stationKey: 'run',
    name,
    round: 1,
    durationSeconds,
    instruction: name,
  })

  const circuit = async (phases: Phase[], cueLeadSeconds: number) => {
    const started = TimedCircuitWeb.start({
      key: 'athlete',
      phases,
      locale: 'en',
      volume: 1,
      cueLeadSeconds,
    })
    watchers[0].success(fix(1_000_000, 0))
    await started
  }

  /** Runs the recording forward to `seconds` in, ticking as the interval does. */
  const runTo = async (seconds: number) => {
    for (let second = 1; second <= seconds; second++) {
      vi.setSystemTime(1_000_000 + second * 1000)
      await TimedCircuitWeb.read({ key: 'athlete' })
    }
  }

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
        cueLeadSeconds: 10,
      }),
    ).rejects.toThrow('Invalid prescription')
  })

  // An interval used to end with the next instruction and no warning, which is
  // no use to a runner about to change pace with the phone in a pocket.
  it('sounds once, a lead ahead of each interval that ends', async () => {
    await circuit([interval('Hard', 60), interval('Easy', 60)], 10)

    await runTo(49)
    expect(playCue).not.toHaveBeenCalled()

    await runTo(50)
    expect(playCue).toHaveBeenCalledTimes(1)

    // The rest of the interval is not a second warning.
    await runTo(59)
    expect(playCue).toHaveBeenCalledTimes(1)

    await runTo(110)
    expect(playCue).toHaveBeenCalledTimes(2)
  })

  // A cue at or before the midpoint is a second instruction rather than a
  // warning, so a short interval runs out unannounced.
  it('leaves an interval shorter than twice the lead alone', async () => {
    await circuit([interval('Sprint', 15), interval('Walk', 45)], 10)

    await runTo(59)

    expect(playCue).toHaveBeenCalledTimes(1)
  })

  it('sounds nothing at all when the lead is off', async () => {
    await circuit([interval('Hard', 60), interval('Easy', 60)], 0)

    await runTo(119)

    expect(playCue).not.toHaveBeenCalled()
  })

  // The one open interval of a session with no set length never reaches a
  // boundary, so there is nothing to warn about.
  it('sounds nothing during an open session', async () => {
    const started = open()
    watchers[0].success(fix(1_000_000, 0))
    await started

    await runTo(600)

    expect(playCue).not.toHaveBeenCalled()
  })
})
