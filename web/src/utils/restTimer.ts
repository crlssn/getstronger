/** Seconds still to wait, never negative and never past the end. */
export const restRemainingSeconds = (now: number, endsAtMs?: number): number =>
  endsAtMs ? Math.max(0, Math.ceil((endsAtMs - now) / 1000)) : 0

/** mm:ss, zero-padded, so the banner's width does not jump as it counts. */
export const restLabel = (remainingSeconds: number): string => {
  const minutes = Math.floor(remainingSeconds / 60)
    .toString()
    .padStart(2, '0')
  const seconds = (remainingSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

/** How much of the rest is left, as a CSS width. */
export const restProgress = (remainingSeconds: number, totalSeconds: number): string => {
  if (totalSeconds <= 0) return '0%'
  return `${Math.min(1, remainingSeconds / totalSeconds) * 100}%`
}

// The banner warms from green through amber as the rest runs down, so a glance
// reads roughly how long is left without reading the number.
const restMinuteHues = [45, 100, 165, 205, 270]

export const restHue = (remainingSeconds: number): number =>
  restMinuteHues[Math.min(Math.floor(remainingSeconds / 60), restMinuteHues.length - 1)] ?? 165

/** Under a minute the banner goes bright; under ten seconds it pulses. */
export const isFinalMinute = (remainingSeconds: number): boolean =>
  remainingSeconds > 0 && remainingSeconds < 60

export const isFinalCountdown = (remainingSeconds: number): boolean =>
  remainingSeconds > 0 && remainingSeconds <= 10
