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

const seconds = 0.2
const peak = 0.3

let context: AudioContext | undefined

/** Says a phrase in the page's voice; a browser without one says nothing. */
export const say = (phrase: string, volume: number): void => {
  try {
    if (!('speechSynthesis' in window) || volume <= 0) return
    const utterance = new SpeechSynthesisUtterance(phrase)
    utterance.volume = Math.min(volume, 1)
    window.speechSynthesis.speak(utterance)
  } catch {
    // A tab that cannot speak still records; the words are the one thing it
    // goes without.
  }
}

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
