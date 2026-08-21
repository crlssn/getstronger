/**
 * The duration the workout tab shows while a session is running.
 *
 * A rest timer counting down takes precedence over the session's own elapsed
 * time: it is the number the user is waiting on. Both are rendered compactly
 * enough to sit under a tab bar icon.
 */
export const workoutTabTimer = (
  now: number,
  startedAtMs?: number,
  restTimerEndsAtMs?: number,
): string => {
  if (restTimerEndsAtMs && restTimerEndsAtMs > now) {
    const remaining = Math.max(0, Math.ceil((restTimerEndsAtMs - now) / 1000))
    const minutes = Math.floor(remaining / 60)
    const seconds = remaining % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  if (!startedAtMs) return ''

  const total = Math.max(0, Math.floor((now - startedAtMs) / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60

  // Past an hour the seconds stop being useful and stop fitting.
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}
