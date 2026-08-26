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

/**
 * When a workout happened, read the way somebody asks about it.
 *
 * Relative inside a month — "3 days ago" is what a reader scrolling a feed
 * wants — and the date itself once it is old enough that "7 weeks ago" says
 * less than the day it fell on. The weekday abbreviates there, because by then
 * it is orientation rather than information.
 */
export const formatWorkoutDate = (date: Timestamp | undefined): string => {
  if (!date) return ''

  const finished = DateTime.fromSeconds(Number(date.seconds))
  if (finished.diffNow('months').months > -1) return relativeToNow(finished)

  return localized(finished).toFormat('ccc, d LLLL · HH:mm')
}
