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

/** Under ten seconds the progress fill pulses. */
export const isFinalCountdown = (remainingSeconds: number): boolean =>
  remainingSeconds > 0 && remainingSeconds <= 10
