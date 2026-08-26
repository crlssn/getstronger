// Charts read their colours from the token layer rather than repeating hex
// values that theme.css already owns.
const token = (name: string, fallback: string) =>
  (typeof window !== 'undefined' &&
    getComputedStyle(document.documentElement).getPropertyValue(name).trim()) ||
  fallback

export const inkColor = token('--color-ink', '#17171a')
export const successColor = token('--color-success', '#047857')
export const subtleColor = token('--color-text-subtle', '#6e6b65')
export const borderColor = token('--color-border', '#edebe7')
