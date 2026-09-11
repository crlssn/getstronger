import type { Phase } from '@/utils/timedCircuit'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { playTone, say } from '@/native/cueTone'
import { openSessionPhases } from '@/utils/timedCircuit'
import { TimedCircuitWeb } from './timedCircuitWeb'

vi.mock('@/native/cueTone', async (original) => ({
  ...(await original<typeof import('@/native/cueTone')>()),
  say: vi.fn(),
  playTone: vi.fn(),
}))

const fix = (
  timestamp: number,
  longitude: number,
  speed: number | null = null,
): GeolocationPosition =>
  ({
    timestamp,
    coords: { latitude: 0, longitude, accuracy: 5, speed },
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
    vi.mocked(say).mockClear()
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

  const open = (autoPause = false) =>
    TimedCircuitWeb.start({
      key: 'athlete',
      phases: openSessionPhases('Bike commute', 'Recording Bike commute', 'bike'),
      locale: 'en',
      volume: 1,
      cueLeadSeconds: 10,
      cuePhrase: '10 seconds',
      completedPhrase: 'Workout completed',
      autoPause,
    })

  /** A fix a second, at a standstill from the second one on. */
  const rideThenStop = () => {
    for (let second = 1; second <= 6; second += 1) {
      vi.setSystemTime(1_000_000 + second * 1000)
      watchers[0].success(fix(1_000_000 + second * 1000, 0, 0))
    }
  }

  const interval = (name: string, durationSeconds: number): Phase => ({
    exerciseId: 'run',
    stationKey: 'run',
    name,
    round: 1,
    durationSeconds,
    instruction: name,
  })

  const circuit = async (
    phases: Phase[],
    cueLeadSeconds: number,
    volume = 1,
    halfwayPhrase = '',
  ) => {
    const started = TimedCircuitWeb.start({
      key: 'athlete',
      phases,
      locale: 'en',
      volume,
      cueLeadSeconds,
      cuePhrase: `${cueLeadSeconds} seconds`,
      halfwayPhrase,
      distanceUnit: 'km',
      completedPhrase: 'Workout completed',
    })
    // The latest watcher: a second circuit in one test watches afresh.
    watchers.at(-1)?.success(fix(1_000_000, 0))
    await started
  }

  /** One more second, without replaying the recording from its start. */
  const step = async (seconds: number) => {
    vi.setSystemTime(1_000_000 + seconds * 1000)
    await TimedCircuitWeb.read({ key: 'athlete' })
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
      cuePhrase: '0 seconds',
      completedPhrase: 'Workout completed',
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
      cuePhrase: '0 seconds',
      completedPhrase: 'Workout completed',
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
        cuePhrase: '10 seconds',
        completedPhrase: 'Workout completed',
        volume: 1,
        cueLeadSeconds: 10,
      }),
    ).rejects.toThrow('Invalid prescription')
  })

  // An interval used to end with the next instruction and no warning, which is
  // no use to a runner about to change pace with the phone in a pocket. The
  // warning is the seconds left, said out loud: a runner mid-stride should not
  // have to remember what a beep means.
  it('says the seconds left once, a lead ahead of each interval that ends', async () => {
    await circuit([interval('Hard', 60), interval('Easy', 60)], 10)

    await runTo(49)
    expect(say).not.toHaveBeenCalled()

    await runTo(50)
    expect(say).toHaveBeenCalledTimes(1)
    expect(say).toHaveBeenCalledWith('10 seconds', 1, 'en')

    // The rest of the interval is not a second warning.
    await runTo(59)
    expect(say).toHaveBeenCalledTimes(1)

    await runTo(110)
    expect(say).toHaveBeenCalledTimes(2)
  })

  // Inside an interval a recording said nothing between the instruction and
  // the warning that it was ending, so a five-minute rep gave a runner no way
  // to know whether the pace they were holding was the one they meant.
  it('calls the midpoint of a worked interval with the pace held over it', async () => {
    const phrase = 'Half way. Pace {pace} per kilometre'
    await circuit([interval('Hard', 120), interval('Easy', 120)], 0, 1, phrase)

    // Four metres a second, which the smoothing reads back a few seconds a
    // kilometre slower over the first minute of a standing start.
    for (let second = 1; second <= 59; second += 1) stride(second, second * 4)
    expect(say).not.toHaveBeenCalled()

    stride(60, 240)
    await step(60)
    expect(say).toHaveBeenCalledExactlyOnceWith('Half way. Pace 4:15 per kilometre', 1, 'en')

    // Once per interval: the rest of it is not a second call.
    await runTo(119)
    expect(say).toHaveBeenCalledTimes(1)
  })

  // A rest is named by the recording but not worked, an open interval has no
  // end to halve, and a pace nothing has measured yet is no pace to give.
  it('says nothing halfway through a rest, a short interval, or an unmeasured one', async () => {
    const phrase = 'Half way. Pace {pace} per kilometre'
    const rest = { ...interval('Rest', 120), exerciseId: '' }
    await circuit([rest, interval('Sprint', 30), interval('Hard', 120)], 0, 1, phrase)

    // Through the rest and the short interval with no fixes at all.
    await runTo(155)
    expect(say).not.toHaveBeenCalled()

    // And through the midpoint of an interval nothing has measured a pace over.
    await runTo(210)
    expect(say).not.toHaveBeenCalled()
  })

  // The cue is its own setting, so the announcements being off does not take
  // it with them: it is said at full volume instead of not at all.
  it('says the cue at full volume while the announcements are off', async () => {
    await circuit([interval('Hard', 60), interval('Easy', 60)], 10, 0)

    await runTo(50)

    expect(say).toHaveBeenCalledWith('10 seconds', 1, 'en')
  })

  it('says the workout is complete once the last interval runs out', async () => {
    await circuit([interval('Hard', 60), interval('Easy', 60)], 10, 0.5)

    await runTo(119)
    expect(say).not.toHaveBeenCalledWith('Workout completed', expect.anything(), expect.anything())

    await step(120)
    expect(say).toHaveBeenCalledWith('Workout completed', 0.5, 'en')
    expect(say).toHaveBeenCalledTimes(3)
  })

  // Ending it by hand is not finishing it, and the completion follows the
  // announcement volume the way every other announcement does.
  it('says nothing about completion when the session is ended early or muted', async () => {
    await circuit([interval('Hard', 60), interval('Easy', 60)], 0)
    await runTo(30)
    await TimedCircuitWeb.finish({ key: 'athlete' })
    expect(say).not.toHaveBeenCalled()

    await TimedCircuitWeb.clear({ key: 'athlete' })
    await circuit([interval('Hard', 60)], 0, 0)
    await runTo(60)
    expect(say).not.toHaveBeenCalled()
  })

  // A cue at or before the midpoint is a second instruction rather than a
  // warning, so a short interval runs out unannounced.
  it('leaves an interval shorter than twice the lead alone', async () => {
    await circuit([interval('Sprint', 15), interval('Walk', 45)], 10)

    await runTo(59)

    expect(say).toHaveBeenCalledTimes(1)
  })

  it('says nothing at all when the lead is off', async () => {
    await circuit([interval('Hard', 60), interval('Easy', 60)], 0)

    await runTo(119)

    expect(say).not.toHaveBeenCalledWith(expect.stringContaining('seconds'), expect.anything())
  })

  // The one open interval of a session with no set length never reaches a
  // boundary, so there is nothing to warn about.
  it('sounds nothing during an open session', async () => {
    const started = open()
    watchers[0].success(fix(1_000_000, 0))
    await started

    await runTo(600)

    expect(say).not.toHaveBeenCalled()
  })

  it('holds itself at a standstill and lets go when the athlete rides on', async () => {
    const started = open(true)
    watchers[0].success(fix(1_000_000, 0, 5))
    await started

    rideThenStop()
    const held = await TimedCircuitWeb.read({ key: 'athlete' })
    // Held from where the standstill began, not from where it was noticed.
    expect(held.recording?.pauses).toEqual([{ startedAt: 1_001_000, auto: true }])

    vi.setSystemTime(1_007_000)
    watchers[0].success(fix(1_007_000, 0.001, 5))
    const { recording } = await TimedCircuitWeb.read({ key: 'athlete' })
    expect(recording?.pauses).toEqual([{ startedAt: 1_001_000, endedAt: 1_007_000, auto: true }])
    // The hold stops the clock, not the route: the fixes it held through are
    // read for movement and kept, so the line never breaks.
    expect(recording?.points.map((point) => point.timestamp)).toEqual([
      1_000_000, 1_001_000, 1_002_000, 1_003_000, 1_004_000, 1_005_000, 1_006_000, 1_007_000,
    ])
  })

  it('keeps the ground covered under a hold the detector would not let go of', async () => {
    const started = open(true)
    watchers[0].success(fix(1_000_000, 0, 5))
    await started

    rideThenStop()
    // A creep too slow to release the hold: the detector keeps holding, and
    // the metres are the athlete's all the same.
    for (let second = 7; second <= 12; second += 1) {
      vi.setSystemTime(1_000_000 + second * 1000)
      watchers[0].success(fix(1_000_000 + second * 1000, (second - 6) * 0.7 * metreDegrees, 0.7))
    }
    const { recording } = await TimedCircuitWeb.read({ key: 'athlete' })
    expect(recording?.pauses).toEqual([{ startedAt: 1_001_000, auto: true }])
    expect(recording?.points.at(-1)?.timestamp).toBe(1_012_000)
    expect(recording?.points).toHaveLength(13)
  })

  it('holds nothing by itself when the athlete never asked it to', async () => {
    const started = open()
    watchers[0].success(fix(1_000_000, 0, 5))
    await started

    rideThenStop()
    const { recording } = await TimedCircuitWeb.read({ key: 'athlete' })
    expect(recording?.pauses).toEqual([])
    expect(recording?.points).toHaveLength(7)
  })

  it('never lets go of a pause the athlete opened by hand', async () => {
    const started = open(true)
    watchers[0].success(fix(1_000_000, 0, 5))
    await started

    vi.setSystemTime(1_001_000)
    await TimedCircuitWeb.pause({ key: 'athlete' })
    for (let second = 2; second <= 8; second += 1) {
      vi.setSystemTime(1_000_000 + second * 1000)
      watchers[0].success(fix(1_000_000 + second * 1000, second * 0.0001, 5))
    }

    const { recording } = await TimedCircuitWeb.read({ key: 'athlete' })
    expect(recording?.pauses).toEqual([{ startedAt: 1_001_000 }])
  })
})
