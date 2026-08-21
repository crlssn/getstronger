// Charts read their colours from the token layer rather than repeating hex
// values that theme.css already owns.
const token = (name: string, fallback: string) =>
  (typeof window !== 'undefined' &&
    getComputedStyle(document.documentElement).getPropertyValue(name).trim()) ||
  fallback

export const inkColor = token('--color-ink', '#25282d')
export const successColor = token('--color-success', '#047857')
export const subtleColor = token('--color-text-subtle', '#656b71')
export const borderColor = token('--color-border', '#e3e5e0')
