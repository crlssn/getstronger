import { dateLocale } from '@/i18n'

export const isNumber = (value: number | string | undefined): boolean => {
  return typeof value === 'number' && !Number.isNaN(value)
}

// Numbers follow the same locale as dates, so a Swedish UI shows Swedish
// separators even when the browser's first language is something else.
export const formatNumber = (value: number, maximumFractionDigits = 0): string =>
  new Intl.NumberFormat(dateLocale(), { maximumFractionDigits }).format(value)
