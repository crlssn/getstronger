type Tone = {
  frequency: number
  offset: number
  duration: number
  volume: number
}

// A compact rising G-major fanfare: energetic enough to cut through a gym,
// but under a second long so repeated rest periods never become irritating.
const fanfare: Tone[] = [
  { frequency: 392, offset: 0, duration: 0.14, volume: 0.18 },
  { frequency: 493.88, offset: 0.12, duration: 0.14, volume: 0.2 },
  { frequency: 587.33, offset: 0.24, duration: 0.16, volume: 0.22 },
  { frequency: 783.99, offset: 0.38, duration: 0.42, volume: 0.28 },
  // A quieter third gives the held final note a celebratory chord rather than
  // another utilitarian timer beep.
  { frequency: 987.77, offset: 0.38, duration: 0.42, volume: 0.1 },
]

export const playRestFinishedSound = (context: AudioContext) => {
  if (context.state !== 'running') return

  try {
    fanfare.forEach(({ frequency, offset, duration, volume }) => {
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

      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + duration + 0.02)
    })
  } catch {
    // Sound is best-effort; never break the workout flow over it.
  }
}
