import type { Phase } from '@/utils/timedCircuit'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { playCue, playTone } from '@/native/cueTone'
import { openSessionPhases } from '@/utils/timedCircuit'
import { TimedCircuitWeb } from './timedCircuitWeb'

vi.mock('@/native/cueTone', () => ({ playCue: vi.fn(), playTone: vi.fn() }))

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

/** A degree of longitude at the equator, on the sphere the route is measured on. */
const metreDegrees = 180 / (6371000 * Math.PI)

// Every note the recorder played, in hertz, in the order it played them.
const tones = () => vi.mocked(playTone).mock.calls.map(([hertz]) => hertz)

describe('the browser recorder', () => {
  beforeEach(() => {
    watchers = []
    localStorage.clear()
    vi.mocked(playCue).mockClear()
    vi.mocked(playTone).mockClear()
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

  const station = (stationKey: string, name: string): Phase => ({
    exerciseId: stationKey,
    stationKey,
    name,
    round: 1,
    durationSeconds: 60,
    instruction: name,
  })
  // Five minutes a kilometre to beat, and a band ten seconds either side.
  const paced = {
    targets: [300, 0],
    toleranceSeconds: 10,
    minimumGapSeconds: 30,
    windowSeconds: 15,
  }
  // Five metres a second is 200 seconds a kilometre, and one metre a second is
  // 1000: one side of the band each.
  const stride = (seconds: number, metres: number) => {
    vi.setSystemTime(1_000_000 + seconds * 1000)
    watchers[0].success(fix(1_000_000 + seconds * 1000, metres * metreDegrees))
  }

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

  // Nothing here speaks, so the level the phones announce at is what the pace
  // tones are played at.
  it('sounds no pace tone at all while the announcements are turned off', async () => {
    const started = TimedCircuitWeb.start({
      key: 'athlete',
      phases: [station('run', 'Run'), station('walk', 'Walk')],
      locale: 'en',
      volume: 0,
      cueLeadSeconds: 0,
      pacing: paced,
    })
    watchers[0].success(fix(1_000_000, 0))
    await started

    for (let step = 1; step <= 4; step += 1) stride(step * 5, step * 25)
    expect(tones()).toEqual([])

    // Turned back up mid-run, and the crossing is heard from there: a muted
    // interval is not judged, so nothing was used up while it was silent.
    await expect(TimedCircuitWeb.setVolume({ key: 'athlete', volume: 1 })).resolves.toBeUndefined()
    stride(25, 125)
    expect(tones()).toEqual([1320])
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

  it('sounds one tone as an interval pulls ahead of its reference and another as it falls behind', async () => {
    const started = TimedCircuitWeb.start({
      key: 'athlete',
      phases: [station('run', 'Run'), station('walk', 'Walk')],
      locale: 'en',
      volume: 1,
      cueLeadSeconds: 0,
      pacing: paced,
    })
    watchers[0].success(fix(1_000_000, 0))
    await started

    // Ahead of the target, and heard once the trailing window holds this
    // interval alone.
    stride(5, 25)
    stride(10, 50)
    expect(tones()).toEqual([])

    stride(15, 75)
    stride(20, 100)
    // The crossing sounds once, not on every fix that follows it.
    expect(tones()).toEqual([1320])

    // A metre a second from here, which is well behind.
    for (let step = 1; step <= 5; step += 1) stride(20 + step * 5, 100 + step * 5)
    expect(tones()).toEqual([1320, 440])
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
