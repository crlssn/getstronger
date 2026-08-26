import type { Timestamp } from '@bufbuild/protobuf/wkt'

import { DateTime } from 'luxon'
import { dateLocale, i18n } from '@/i18n'

const localized = (date: DateTime): DateTime => date.setLocale(dateLocale)

/** Below this, a count of seconds is noise rather than precision. */
const justNowSeconds = 60

/** Past this, the day it fell on says more than the count of days. */
const relativeDays = 7

/**
 * When something happened, in the one form every row in the app uses.
 *
 * The feed alone used to mix "Just now", "25 seconds ago", "7 days ago",
 * "Wed, 8 July · 14:15" and "26 Aug 2026" — five formats, two of them on the
 * same screen. One rule instead: under a minute it is just now, under a week it
 * counts in the largest unit that fits, and past that it is the date. No time
 * of day — that is a fact about a session, not a timestamp on a row, and it
 * lives on the workout detail page in `formatMoment`.
 */
const relativeToNow = (date: DateTime): string => {
  const elapsed = -date.diffNow('seconds').seconds

  // A server timestamp a few hundred milliseconds ahead of the client clock
  // renders as "in 0 seconds", which reads as broken rather than as recent.
  if (elapsed < justNowSeconds) return i18n.t('date.justNow')

  if (-date.diffNow('days').days < relativeDays) {
    return localized(date).toRelative({ unit: ['days', 'hours', 'minutes'] }) ?? ''
  }

  return localized(date).toLocaleString(DateTime.DATE_MED)
}

export const formatTimestamp = (date: Timestamp | undefined): string => {
  if (!date) return ''
  return relativeToNow(DateTime.fromSeconds(Number(date.seconds)))
}

export const formatUnixTimestamp = (timestamp: bigint | undefined): string => {
  if (!timestamp) return ''
  return relativeToNow(DateTime.fromSeconds(Number(timestamp)))
}

/**
 * The exact moment a session ran, for the page that is about that session.
 *
 * The weekday is orientation, the time of day is the fact somebody came to the
 * detail page for. Nowhere else — on a row it is a timestamp, not a fact.
 */
export const formatMoment = (date: Timestamp | undefined): string => {
  if (!date) return ''
  return localized(DateTime.fromSeconds(Number(date.seconds))).toFormat('ccc, d LLLL · HH:mm')
}
