import { newPaceWatch, watchPace, type Pacing, type PaceTone } from '@/utils/pacing'
import { currentPace, type Phase, type Recording } from '@/utils/timedCircuit'

import { playCue, playTone } from '@/native/cueTone'
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
 * It speaks nothing, so the volume the phones announce at is applied to the
 * pace tones instead — turned all the way down, the recorder sounds none. The
 * interval cue keeps its own setting, as it does on the phones.
 */

const storageKey = 'getstronger:timed-circuit'
const maxDurationMs = 24 * 60 * 60 * 1000
const maxPhases = 10000
const maxPoints = 90000
const tickMs = 250
const fixTimeoutMs = 30000

// The two notes, in hertz: the interval is going better than the reference, or
// worse than it. Higher is better is the one convention nobody has to be
// taught, and both sit clear of the 880 the interval cue sounds on, so three
// sounds in one run are three different sounds. The phones sound the same two.
const toneHertz: Record<PaceTone, number> = { ahead: 1320, behind: 440 }

interface Saved {
  key: string
  recording: Recording
  /** Seconds of warning before an interval ends; 0 sounds nothing. */
  cueLeadSeconds: number
  checkpoint: number
  /** How loudly the recorder sounds, 0 to 1; 0 is silent. */
  volume: number
  // The session this one is paced against, absent where there is none.
  pacing?: Pacing
}

let saved: Saved | undefined
let watch: number | undefined
let timer: ReturnType<typeof setInterval> | undefined
let loaded = false
/** The interval already warned about, so a tone sounds once per interval. */
let cued = -1
// Held in memory rather than with the recording: a reload has heard nothing,
// so it starts the comparison over rather than resuming a crossing.
let pace = newPaceWatch()

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
  if (!saved?.pacing) return
  const reading = {
    phaseIndex,
    phaseSeconds,
    pace: currentPace(saved.recording, at, saved.pacing.windowSeconds),
    at,
  }
  const result = watchPace(pace, reading, saved.pacing)
  pace = result.watch
  if (result.tone) playTone(toneHertz[result.tone])
}

const stopWatching = () => {
  if (watch !== undefined) navigator.geolocation.clearWatch(watch)
  watch = undefined
  if (timer !== undefined) clearInterval(timer)
  timer = undefined
}

const end = (at: number) => {
  if (!saved || saved.recording.endedAt) return
  const recording = saved.recording
  recording.endedAt = at
  const last = recording.pauses.at(-1)
  if (last && !last.endedAt) last.endedAt = at
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
  if (recording.pauses.at(-1) && !recording.pauses.at(-1)?.endedAt) return
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
        playCue()
      }
      judge(index, (elapsed - opened) / 1000, at)
      if (at - saved.checkpoint > 1000) persist()
      return
    }
  }
  end(at - (elapsed - boundary))
}

const record = (position: GeolocationPosition) => {
  tick()
  if (!saved || saved.recording.endedAt) return
  const recording = saved.recording
  if (recording.pauses.at(-1) && !recording.pauses.at(-1)?.endedAt) return
  const timestamp = Math.round(position.timestamp)
  if (
    timestamp < recording.startedAt ||
    timestamp > now() ||
    timestamp <= (recording.points.at(-1)?.timestamp ?? 0)
  )
    return
  if (recording.points.length >= maxPoints) {
    recording.interrupted = true
    end(now())
    return
  }
  recording.points.push({
    timestamp,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
  })
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
  cueLeadSeconds: number,
  volume: number,
  pacing?: Pacing,
) =>
  new Promise<void>((resolve, reject) => {
    cued = -1
    pace = newPaceWatch()
    saved = {
      key,
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
      checkpoint: now(),
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
    pacing?: Pacing
  }): Promise<void> {
    load()
    if (saved) throw new Error('A recording is already saved or active')
    if (!valid(options.phases)) throw new Error('Invalid prescription')
    await begin(
      options.key,
      options.phases,
      options.cueLeadSeconds,
      options.volume,
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
      const last = saved.recording.pauses.at(-1)
      if (last && !last.endedAt) return
      saved.recording.pauses.push({ startedAt: now() })
    })
  },

  resume(options: { key: string }): Promise<void> {
    return mutate(options.key, () => {
      const last = saved?.recording.pauses.at(-1)
      if (!last || last.endedAt) return
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
    try {
      store()?.removeItem(storageKey)
    } catch {
      // Nothing left to do about it: the recording is gone from memory, which
      // is what the caller asked for.
    }
    return Promise.resolve()
  },
}
