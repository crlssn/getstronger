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

export const formatToRelativeDateTime = (date: Timestamp | undefined): string => {
  if (!date) return ''
  const relative = localized(DateTime.fromSeconds(Number(date.seconds))).toRelative()
  if (relative === '0 seconds ago' || relative === 'för 0 sekunder sedan')
    return i18n.global.t('date.justNow')
  return relative ?? ''
}

export const formatUnixToRelativeDateTime = (timestamp: bigint | undefined): string => {
  if (!timestamp) return ''
  const relative = localized(DateTime.fromSeconds(Number(timestamp))).toRelative()
  if (relative === '0 seconds ago' || relative === 'för 0 sekunder sedan')
    return i18n.global.t('date.justNow')
  return relative ?? ''
}
