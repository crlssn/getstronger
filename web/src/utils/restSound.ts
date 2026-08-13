type Tone = {
  frequency: number
  offset: number
  duration: number
  volume: number
}

// A quick two-note heads-up: distinct from both the ticking visual treatment
// and the larger completion fanfare.
const getReadyCue: Tone[] = [
  { frequency: 440, offset: 0, duration: 0.12, volume: 0.14 },
  { frequency: 659.25, offset: 0.14, duration: 0.2, volume: 0.18 },
]

// A compact rising G-major fanfare: energetic enough to cut through a gym,
// but under a second long so repeated rest periods never become irritating.
const finishedFanfare: Tone[] = [
  { frequency: 392, offset: 0, duration: 0.14, volume: 0.18 },
  { frequency: 493.88, offset: 0.12, duration: 0.14, volume: 0.2 },
  { frequency: 587.33, offset: 0.24, duration: 0.16, volume: 0.22 },
  { frequency: 783.99, offset: 0.38, duration: 0.42, volume: 0.28 },
  // A quieter third gives the held final note a celebratory chord rather than
  // another utilitarian timer beep.
  { frequency: 987.77, offset: 0.38, duration: 0.42, volume: 0.1 },
]

const resumeAudio = async (context: AudioContext) => {
  try {
    if (context.state === 'closed') return false
    if (context.state !== 'running') await context.resume()
    return context.state === 'running'
  } catch {
    return false
  }
}

const playTones = (context: AudioContext, tones: Tone[]) => {
  try {
    tones.forEach(({ frequency, offset, duration, volume }) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const start = context.currentTime + offset

      // Triangle waves retain a clear attack on phone speakers without the
      // piercing alarm quality of a square wave.
      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(frequency * 0.97, start)
      oscillator.frequency.exponentialRampToValueAtTime(frequency, start + 0.025)

      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.012)
      gain.gain.setValueAtTime(volume, start + Math.min(0.07, duration * 0.45))
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + duration + 0.02)
    })
    return true
  } catch {
    // Sound is best-effort; never break the workout flow over it.
    return false
  }
}

// Mobile Safari needs audio to be exercised during a real user interaction;
// merely constructing or resuming an AudioContext is not always sufficient.
export const unlockRestSound = async (context: AudioContext) => {
  try {
    if (context.state === 'closed') return false
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const now = context.currentTime
    gain.gain.setValueAtTime(0.0001, now)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.01)
    // Start the inaudible node synchronously within the user gesture, then
    // resume. Safari is less reliable when node creation happens after await.
    return await resumeAudio(context)
  } catch {
    return false
  }
}

export const shouldPlayRestGetReadySound = (seconds: number, alreadyPlayed: boolean) =>
  seconds > 0 && seconds <= 10 && !alreadyPlayed

export const playRestGetReadySound = async (context: AudioContext) =>
  (await resumeAudio(context)) && playTones(context, getReadyCue)

export const playRestFinishedSound = async (context: AudioContext) =>
  (await resumeAudio(context)) && playTones(context, finishedFanfare)
