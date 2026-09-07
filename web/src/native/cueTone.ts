/**
 * The notes a browser recording sounds: the warning that an interval is about
 * to end, and the two that say how the interval is going against the session
 * it is paced against.
 *
 * The phones sound their own — a locked screen is the whole point of the
 * native plugin — so this is only what the stand-in recorder plays. One
 * context serves the tab: browsers cap how many a page may open, and a
 * session is a few hundred beeps long.
 */

const cueHz = 880
const seconds = 0.2
const peak = 0.3

let context: AudioContext | undefined

/** The warning before an interval ends. */
export const playCue = (): void => playTone(cueHz)

export const playTone = (frequencyHz: number, level = peak): void => {
  try {
    context ??= new AudioContext()
    // Autoplay policy suspends a context opened before the first gesture;
    // starting a recording is one, so this wakes it rather than failing.
    void context.resume()
    const at = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = frequencyHz
    // Ramped rather than switched, so the tone does not click at either end.
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(level, at + 0.01)
    gain.gain.linearRampToValueAtTime(0, at + seconds)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(at)
    oscillator.stop(at + seconds)
  } catch {
    // A tab that will not give up an audio context still records; the notes
    // are the one thing it goes without.
  }
}
