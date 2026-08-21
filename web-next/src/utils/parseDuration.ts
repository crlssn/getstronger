const maxSeconds = 59

/**
 * Reads a typed duration as seconds, or `undefined` for an empty field.
 *
 * Two forms are accepted. With a colon it is minutes and seconds. Without one,
 * bare digits fill in from the right like a stopwatch: "45" is 45 seconds and
 * "130" is 1:30 — treating them as raw seconds ("130" = 2:10) surprises anyone
 * who typed what they read off a timer.
 *
 * Anything unreadable returns `fallback`, so a half-typed value never wipes the
 * number that was already there.
 */
export const parseDuration = (raw: string, fallback?: number): number | undefined => {
  const value = raw.trim()
  if (!value) return undefined

  if (value.includes(':')) {
    const [minutes = '0', seconds = '0'] = value.split(':')
    const parsedMinutes = Number(minutes || 0)
    const parsedSeconds = Number(seconds || 0)

    const unreadable =
      !Number.isFinite(parsedMinutes) ||
      !Number.isFinite(parsedSeconds) ||
      parsedMinutes < 0 ||
      parsedSeconds < 0
    if (unreadable) return fallback

    return Math.round(parsedMinutes * 60 + Math.min(parsedSeconds, maxSeconds))
  }

  const digits = value.replace(/\D/g, '')
  if (!digits) return fallback

  return Number(digits.slice(0, -2) || 0) * 60 + Number(digits.slice(-2))
}
