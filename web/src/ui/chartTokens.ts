// Charts read their colours from the token layer rather than repeating hex
// values that theme.css already owns.
const token = (name: string, fallback: string) =>
  (typeof window !== 'undefined' &&
    getComputedStyle(document.documentElement).getPropertyValue(name).trim()) ||
  fallback

export const inkColor = token('--color-ink', '#17171a')
/* The bars that are not the latest one, so the latest reads by weight rather
   than by hue: green means "live right now", and last week is not that. */
export const inkMutedColor = token('--color-ink-muted', '#56534e')
export const subtleColor = token('--color-text-subtle', '#6e6b65')
export const borderColor = token('--color-border', '#edebe7')
