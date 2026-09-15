/**
 * What a browser recording says and sounds: the seconds left before an
 * interval ends, the ending itself, and the two notes that say how the
 * interval is going against the session it is paced against.
 *
 * The phones speak and sound their own — a locked screen is the whole point
 * of the native plugin — so this is only what the stand-in recorder plays.
 * One audio context serves the tab: browsers cap how many a page may open,
 * and a session is a few hundred beeps long.
 */

import {
  announcementLocale,
  announcementParts,
  announcementPauseSeconds,
  bestVoice,
} from '@/native/announcementVoice'
import type { PaceTone } from '@/utils/pacing'

// A note is ramped rather than switched at both ends, because a square edge on
// a sine is heard as a click. Ten milliseconds is short enough to keep a tap
// crisp and long enough that there is nothing to hear at the join.
const fadeSeconds = 0.01

/**
 * The shape of each of the two notes.
 *
 * Pitch alone is a poor signal on a road: a fifth is hard to place under music
 * and behind a footfall, and an athlete who hears one note in twenty minutes
 * has nothing to compare it to. Rhythm carries where pitch does not, so ahead
 * is two quick taps and behind is one long note — told apart by counting,
 * which needs no ear at all. The phones sound the same two.
 */
export interface PaceToneShape {
  hertz: number
  /** How long one beep lasts, in seconds. */
  seconds: number
  /** How many beeps the note is made of. */
  beeps: number
  /** The silence between them, in seconds. */
  gapSeconds: number
  /** How loud, as a fraction of the level the note is played at. */
  level: number
}

export const paceTones: Record<PaceTone, PaceToneShape> = {
  // Two taps at six tenths the level: a pair carries without the volume a
  // single note was reaching for, and the whole gesture is over in a fifth of
  // a second.
  ahead: { hertz: 1320, seconds: 0.07, beeps: 2, gapSeconds: 0.06, level: 0.6 },
  // One note held for six tenths of a second. Length is what says "slower",
  // so it is sustained rather than left to decay: a note that fades out at
  // once is over before it has said anything.
  behind: { hertz: 440, seconds: 0.6, beeps: 1, gapSeconds: 0, level: 1 },
}

/** How loud a pace note is at full announcement volume. */
export const paceToneVolume = 0.3

let context: AudioContext | undefined

/**
 * Says a phrase in the best voice the browser has; one without any says nothing.
 *
 * The language is always set and the voice only where one beats what the
 * browser would have chosen: left to itself it reads a Swedish cue out in the
 * page's own language, in the flattest voice it ships.
 */
export const say = (phrase: string, volume: number, locale: string): void => {
  try {
    if (!('speechSynthesis' in window) || volume <= 0) return
    const parts = announcementParts(phrase)
    // Chrome fills this list asynchronously and answers with none until it
    // has: the first cue of a session is then said in the default voice, and
    // every one after it in the chosen one.
    const voice = bestVoice(locale, window.speechSynthesis.getVoices())
    const speakFrom = (index: number) => {
      const utterance = new SpeechSynthesisUtterance(parts[index])
      utterance.volume = Math.min(volume, 1)
      utterance.lang = announcementLocale(locale)
      if (voice) utterance.voice = voice
      // The web speech API has no pause and runs queued utterances straight
      // into one another, so the rest of the phrase waits on a timer. Started
      // from the end of this part rather than from now: a queue is not a
      // clock, and the part ahead of it may be any length.
      if (index + 1 < parts.length)
        utterance.onend = () =>
          window.setTimeout(() => speakFrom(index + 1), announcementPauseSeconds * 1000)
      window.speechSynthesis.speak(utterance)
    }
    if (parts.length > 0) speakFrom(0)
  } catch {
    // A tab that cannot speak still records; the words are the one thing it
    // goes without.
  }
}

/** Stops whatever is being said, so the next phrase replaces it rather than queues. */
export const hush = (): void => {
  try {
    window.speechSynthesis?.cancel()
  } catch {
    // Same as not being able to speak at all: there is nothing to stop.
  }
}

/**
 * Sounds one of the two pace notes at the level it is given.
 *
 * Higher is better is the one convention nobody has to be taught, and the
 * interval cue is spoken, so a note is never mistaken for it.
 */
export const playPaceTone = (tone: PaceTone, level: number): void => {
  const shape = paceTones[tone]
  try {
    context ??= new AudioContext()
    const sound = context
    const schedule = () => {
      const from = sound.currentTime
      const peak = level * shape.level
      for (let beep = 0; beep < shape.beeps; beep += 1) {
        const at = from + beep * (shape.seconds + shape.gapSeconds)
        const oscillator = sound.createOscillator()
        const gain = sound.createGain()
        oscillator.frequency.value = shape.hertz
        gain.gain.setValueAtTime(0, at)
        gain.gain.linearRampToValueAtTime(peak, at + fadeSeconds)
        gain.gain.setValueAtTime(peak, at + shape.seconds - fadeSeconds)
        gain.gain.linearRampToValueAtTime(0, at + shape.seconds)
        oscillator.connect(gain).connect(sound.destination)
        oscillator.start(at)
        oscillator.stop(at + shape.seconds)
      }
    }
    // Autoplay policy suspends a context opened before the first gesture, and
    // a suspended clock does not move: a note scheduled against it is already
    // in the past by the time there is anything to play it, so it is never
    // heard. Waking it first is what makes the first note of a tab audible.
    if (sound.state === 'suspended') void sound.resume().then(schedule, () => schedule())
    else schedule()
  } catch {
    // A tab that will not give up an audio context still records; the notes
    // are the one thing it goes without.
  }
}
