import { DistanceUnit } from '@/proto/api/v1/shared_pb'

import { movementThresholds, readMovement } from '@/utils/movement'
import { newPaceWatch, watchPace, type Pacing } from '@/utils/pacing'
import {
  currentPace,
  paceFloorMeters,
  type Pause,
  type Phase,
  type Recording,
  type RoutePoint,
} from '@/utils/timedCircuit'

import { paceToneHertz, paceToneVolume, playTone, say } from '@/native/cueTone'
import { callsHalfway, halfwaySaid } from '@/utils/halfwayCue'
import { cuesInterval } from '@/utils/intervalCue'

/**
 * The recorder a browser can run, standing in for the native plugin.
 *
 * A phone owns its recording outside the WebView so a locked screen keeps
 * measuring; a browser has no equivalent, so this keeps the same document in
 * `localStorage` and reads the same fixes from the Geolocation API. It is what
 * an open-ended session runs on outside the app, and what the end-to-end suite
 * records against.
 *
 * It announces no phases, so the volume the phones announce at is applied to
 * the pace tones and the ending instead — turned all the way down, the
 * recorder sounds none. The interval cue keeps its own setting, as it does on
 * the phones: with the announcements off it is said at full volume.
 */

const storageKey = 'getstronger:timed-circuit'
const maxDurationMs = 24 * 60 * 60 * 1000
const maxPhases = 10000
const maxPoints = 90000
const tickMs = 250
const fixTimeoutMs = 30000
// Enough to read the dwell through at any fix rate a browser offers, and no
// more: this window is the detector's whole input.
const maxFixes = 60

interface Saved {
  key: string
  recording: Recording
  /** Seconds of warning before an interval ends; 0 says nothing. */
  cueLeadSeconds: number
  /** The language the phrases are in, so the best voice for it says them. */
  locale: string
  /** The warning, spoken: the seconds left, in the athlete's language. */
  cuePhrase: string
  /** Said at an interval's midpoint, `{pace}` left for the pace; empty says nothing. */
  halfwayPhrase: string
  /** The unit the spoken pace is per, `km` or `mi`. */
  distanceUnit: string
  /** Said once the last interval runs out, and not when the athlete ends it. */
  completedPhrase: string
  checkpoint: number
  /** How loudly the recorder sounds, 0 to 1; 0 is silent. */
  volume: number
  // The session this one is paced against, absent where there is none.
  pacing?: Pacing
  autoPause?: boolean
}

let saved: Saved | undefined
let watch: number | undefined
let timer: ReturnType<typeof setInterval> | undefined
let loaded = false
/** The interval already warned about, so the cue is said once per interval. */
let cued = -1
/** The interval already called halfway, so the call is made once per interval. */
let halved = -1
// Held in memory rather than with the recording: a reload has heard nothing,
// so it starts the comparison over rather than resuming a crossing.
let pace = newPaceWatch()
// The fixes the stationary detector reads, which unlike the route go on
// arriving while the recording is held — otherwise nothing could tell it the
// athlete had set off again.
let fixes: RoutePoint[] = []

const now = () => Math.round(Date.now())

const store = (): Storage | undefined => {
  try {
    return window.localStorage
  } catch {
    // Private browsing can refuse storage outright; the recording then lives
    // for as long as the page does, which is better than not recording.
    return undefined
  }
}

const persist = () => {
  if (!saved) return
  saved.checkpoint = now()
  try {
    store()?.setItem(storageKey, JSON.stringify(saved))
  } catch {
    // A full quota must not take the recording down with it: the document in
    // memory is still the one being read every second.
  }
}

/**
 * Says how the interval is going against the session it is paced against.
 *
 * The trailing pace is the one the screen shows, held against the target for
 * this interval; a tone plays where it crosses out of the band, and the watch
 * remembers enough not to repeat itself.
 */
const judge = (phaseIndex: number, phaseSeconds: number, at: number) => {
  // Turned off, nothing is judged rather than judged and swallowed: turning
  // the sound back on then hears the next crossing instead of missing it.
  if (!saved?.pacing || saved.volume <= 0) return
  const reading = {
    phaseIndex,
    phaseSeconds,
    // No floor: the tones are judged over a whole interval's window against a
    // target, which is not the standing start the screen's floor is there for.
    pace: currentPace(saved.recording, at, saved.pacing.windowSeconds, 0),
    at,
  }
  const result = watchPace(pace, reading, saved.pacing)
  pace = result.watch
  if (result.tone) playTone(paceToneHertz[result.tone], paceToneVolume * saved.volume)
}

/**
 * How loud a call that is its own setting is said at.
 *
 * The interval cue and the halfway call are settings of their own, so the
 * announcements being off does not silence them: they are said at full volume
 * instead.
 */
const cueVolume = () => (saved && saved.volume > 0 ? saved.volume : 1)

/** The unit the athlete reads a pace in, as the plugin was told it. */
const spokenUnit = () =>
  saved?.distanceUnit === 'mi' ? DistanceUnit.MILES : DistanceUnit.KILOMETERS

const stopWatching = () => {
  if (watch !== undefined) navigator.geolocation.clearWatch(watch)
  watch = undefined
  if (timer !== undefined) clearInterval(timer)
  timer = undefined
}

/** The pause the recording is currently held by, if it is held at all. */
const held = (recording: Recording): Pause | undefined => {
  const last = recording.pauses.at(-1)
  return last && !last.endedAt ? last : undefined
}

const end = (at: number) => {
  if (!saved || saved.recording.endedAt) return
  const recording = saved.recording
  recording.endedAt = at
  const last = held(recording)
  if (last) last.endedAt = at
  stopWatching()
  persist()
}

/** A recording the page was closed on ends where its last checkpoint was. */
const load = () => {
  if (loaded) return
  loaded = true
  const raw = store()?.getItem(storageKey)
  if (!raw) return
  try {
    saved = JSON.parse(raw) as Saved
  } catch {
    store()?.removeItem(storageKey)
    return
  }
  if (!saved.recording.endedAt) {
    saved.recording.interrupted = true
    end(saved.checkpoint)
  }
}

const activeMilliseconds = (recording: Recording, at: number) =>
  at -
  recording.startedAt -
  recording.pauses.reduce((sum, pause) => sum + ((pause.endedAt ?? at) - pause.startedAt), 0)

/**
 * Advances the recording to now: a prescription that has run out ends it.
 *
 * An open interval never runs out, so a session with no set length only ever
 * checkpoints here and ends when the athlete says so.
 */
const tick = () => {
  if (!saved || saved.recording.endedAt) return
  const recording = saved.recording
  const at = now()
  if (at - recording.startedAt >= maxDurationMs) {
    recording.interrupted = true
    end(at)
    return
  }
  if (held(recording)) return
  const elapsed = activeMilliseconds(recording, at)
  const lead = saved.cueLeadSeconds * 1000
  let boundary = 0
  for (const [index, phase] of recording.phases.entries()) {
    if (phase.durationSeconds === undefined) return
    const opened = boundary
    boundary += phase.durationSeconds * 1000
    if (elapsed < boundary) {
      if (
        cued !== index &&
        cuesInterval(phase.durationSeconds, saved.cueLeadSeconds) &&
        elapsed >= boundary - lead
      ) {
        cued = index
        // The cue is its own setting, so the announcements being off does not
        // silence it: it is said at full volume instead.
        say(saved.cuePhrase, cueVolume(), saved.locale)
      }
      const phaseSeconds = (elapsed - opened) / 1000
      if (halved !== index && phaseSeconds >= phase.durationSeconds / 2 && callsHalfway(phase)) {
        // Made once whether or not there was a pace to give: a call arriving
        // at four fifths of an interval is not a call at its midpoint.
        halved = index
        const pace = saved.halfwayPhrase
          ? currentPace(saved.recording, at, phaseSeconds, paceFloorMeters)
          : undefined
        if (pace !== undefined)
          say(halfwaySaid(saved.halfwayPhrase, pace, spokenUnit()), cueVolume(), saved.locale)
      }
      judge(index, phaseSeconds, at)
      if (at - saved.checkpoint > 1000) persist()
      return
    }
  }
  end(at - (elapsed - boundary))
  say(saved.completedPhrase, saved.volume, saved.locale)
}

/**
 * Hold or release the recording on what the fixes say, when it was asked to.
 *
 * Only a pause it opened itself is released: an athlete who paused by hand
 * meant it, and the traffic moving off is not their cue to start recording.
 */
const autoPause = (at: number) => {
  if (!saved?.autoPause || saved.recording.endedAt) return
  const recording = saved.recording
  const open = held(recording)
  if (open && !open.auto) return
  const movement = readMovement(fixes, at)
  if (open) {
    if (movement !== 'moving') return
    open.endedAt = at
    persist()
    return
  }
  if (movement !== 'still') return
  // Held from where the athlete stopped rather than from where the dwell
  // noticed, without ever reaching back past the last thing that happened.
  recording.pauses.push({
    startedAt: Math.max(
      at - movementThresholds.dwellMs,
      recording.pauses.at(-1)?.endedAt ?? recording.startedAt,
    ),
    auto: true,
  })
  persist()
}

const record = (position: GeolocationPosition) => {
  tick()
  if (!saved || saved.recording.endedAt) return
  const recording = saved.recording
  const timestamp = Math.round(position.timestamp)
  const seen = Math.max(recording.points.at(-1)?.timestamp ?? 0, fixes.at(-1)?.timestamp ?? 0)
  if (timestamp < recording.startedAt || timestamp > now() || timestamp <= seen) return
  const point: RoutePoint = {
    timestamp,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    // Null is what a receiver that measured no speed reports, and negative is
    // what one that tried and failed reports.
    ...(position.coords.speed !== null && position.coords.speed >= 0
      ? { speed: position.coords.speed }
      : {}),
  }
  fixes = [...fixes, point].slice(-maxFixes)
  autoPause(timestamp)
  // A hold the detector opened stops the clock, not the route: it may have
  // read a creep as a standstill, and ground it never recorded is ground
  // nothing can give back. A hold the athlete opened drops its fixes, because
  // they may have gone home with the recording still open.
  const open = held(recording)
  if (open && !open.auto) return
  if (recording.points.length >= maxPoints) {
    recording.interrupted = true
    end(now())
    return
  }
  recording.points.push(point)
  persist()
}

/** A prescription is timed throughout, or is the one open interval. */
const valid = (phases: Phase[]) =>
  phases.length > 0 &&
  phases.length <= maxPhases &&
  (phases.every((phase) => (phase.durationSeconds ?? 0) > 0) ||
    (phases.length === 1 && phases[0].durationSeconds === undefined))

const begin = (
  key: string,
  phases: Phase[],
  locale: string,
  cueLeadSeconds: number,
  cuePhrase: string,
  halfwayPhrase: string,
  distanceUnit: string,
  completedPhrase: string,
  volume: number,
  autoPauses: boolean,
  pacing?: Pacing,
) =>
  new Promise<void>((resolve, reject) => {
    cued = -1
    halved = -1
    pace = newPaceWatch()
    fixes = []
    saved = {
      key,
      locale,
      volume,
      pacing,
      recording: {
        version: 1,
        startedAt: now(),
        phases,
        pauses: [],
        points: [],
        interrupted: false,
      },
      cueLeadSeconds,
      cuePhrase,
      halfwayPhrase,
      distanceUnit,
      completedPhrase,
      checkpoint: now(),
      autoPause: autoPauses,
    }
    persist()
    let settled = false
    watch = navigator.geolocation.watchPosition(
      (position) => {
        record(position)
        if (settled) return
        settled = true
        resolve()
      },
      (error) => {
        // Refused before the first fix, the session never started; refused
        // after one, it ends where the fixes stopped, as a phone's does.
        if (error.code === error.PERMISSION_DENIED && !settled) {
          stopWatching()
          saved = undefined
          store()?.removeItem(storageKey)
          settled = true
          reject(new Error('LOCATION_DENIED'))
          return
        }
        // A fix that never arrives leaves a gap the saved route reports; the
        // session itself carries on, because the clock is still worth having.
        if (saved) saved.recording.interrupted = true
        if (error.code === error.PERMISSION_DENIED) end(now())
        else persist()
        if (settled) return
        settled = true
        resolve()
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: fixTimeoutMs },
    )
    timer = setInterval(tick, tickMs)
  })

const mutate = (key: string, action: () => void): Promise<void> => {
  load()
  if (!saved || saved.key !== key) return Promise.reject(new Error('Recording not found'))
  tick()
  action()
  persist()
  return Promise.resolve()
}

export const TimedCircuitWeb = {
  async start(options: {
    key: string
    phases: Phase[]
    locale: string
    volume: number
    cueLeadSeconds: number
    cuePhrase: string
    halfwayPhrase?: string
    distanceUnit?: string
    completedPhrase: string
    pacing?: Pacing
    autoPause?: boolean
  }): Promise<void> {
    load()
    if (saved) throw new Error('A recording is already saved or active')
    if (!valid(options.phases)) throw new Error('Invalid prescription')
    await begin(
      options.key,
      options.phases,
      options.locale,
      options.cueLeadSeconds,
      options.cuePhrase,
      options.halfwayPhrase ?? '',
      options.distanceUnit ?? 'km',
      options.completedPhrase,
      options.volume,
      options.autoPause ?? false,
      options.pacing,
    )
  },

  read(options: { key: string }): Promise<{ recording?: Recording }> {
    load()
    tick()
    return Promise.resolve(saved?.key === options.key ? { recording: saved.recording } : {})
  },

  pause(options: { key: string }): Promise<void> {
    return mutate(options.key, () => {
      if (!saved || saved.recording.endedAt) return
      if (held(saved.recording)) return
      saved.recording.pauses.push({ startedAt: now() })
    })
  },

  resume(options: { key: string }): Promise<void> {
    return mutate(options.key, () => {
      const last = saved && held(saved.recording)
      if (!last) return
      last.endedAt = now()
    })
  },

  finish(options: { key: string }): Promise<void> {
    return mutate(options.key, () => end(now()))
  },

  setVolume(options: { key: string; volume: number }): Promise<void> {
    load()
    if (saved?.key === options.key) saved.volume = Math.min(Math.max(options.volume, 0), 1)
    return Promise.resolve()
  },

  clear(options: { key: string }): Promise<void> {
    load()
    if (saved?.key !== options.key) return Promise.resolve()
    end(now())
    saved = undefined
    pace = newPaceWatch()
    fixes = []
    try {
      store()?.removeItem(storageKey)
    } catch {
      // Nothing left to do about it: the recording is gone from memory, which
      // is what the caller asked for.
    }
    return Promise.resolve()
  },
}
