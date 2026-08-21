import type { Timestamp } from '@bufbuild/protobuf/wkt'

import { DateTime } from 'luxon'
import { dateLocale, i18n } from '@/i18n'

const localized = (date: DateTime): DateTime => date.setLocale(dateLocale)

export const formatToCompactDateTime = (date: Timestamp | undefined): string => {
  if (!date) return ''
  return localized(DateTime.fromSeconds(Number(date.seconds))).toFormat('EEE dd LLL HH:mm')
}

export const formatToShortDateTime = (date: Timestamp | undefined): string => {
  if (!date) return ''
  return localized(DateTime.fromSeconds(Number(date.seconds))).toLocaleString(DateTime.DATE_MED)
}

/**
 * Renders a moment as "3 minutes ago", or "Just now" when it is too recent to
 * count.
 *
 * Anything under a second becomes "0 seconds", and a server timestamp a few
 * hundred milliseconds ahead of the client clock renders as "in 0 seconds" —
 * both are read as broken rather than recent, so the threshold is on the
 * elapsed time rather than on the rendered string.
 */
const relativeToNow = (date: DateTime): string => {
  if (date.diffNow('seconds').seconds > -1) return i18n.t('date.justNow')
  return localized(date).toRelative() ?? ''
}

export const formatToRelativeDateTime = (date: Timestamp | undefined): string => {
  if (!date) return ''
  return relativeToNow(DateTime.fromSeconds(Number(date.seconds)))
}

export const formatUnixToRelativeDateTime = (timestamp: bigint | undefined): string => {
  if (!timestamp) return ''
  return relativeToNow(DateTime.fromSeconds(Number(timestamp)))
}
