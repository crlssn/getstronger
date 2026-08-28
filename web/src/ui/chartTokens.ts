// Charts read their colours from the token layer rather than repeating hex
// values that theme.css already owns.
const token = (name: string, fallback: string) =>
  (typeof window !== 'undefined' &&
    getComputedStyle(document.documentElement).getPropertyValue(name).trim()) ||
  fallback

export const inkColor = token('--color-ink', '#17171a')
export const subtleColor = token('--color-text-subtle', '#6e6b65')
export const borderColor = token('--color-border', '#edebe7')
export const surfaceColor = token('--color-surface', '#ffffff')
/* The bars that are not the current period, so the current one reads by
   weight rather than by hue. */
export const chartBarColor = token('--color-chart-bar', '#dbd8ce')
/* The shallow ink pool under a trend line. */
export const chartFillColor = token('--color-chart-fill', 'rgb(23 23 26 / 0.06)')
