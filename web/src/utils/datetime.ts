import { DateTime } from 'luxon'
import type { Timestamp } from '@bufbuild/protobuf/wkt'

export const formatToCompactDateTime = (date: Timestamp | undefined): string => {
  if (!date) return ''
  return DateTime.fromSeconds(Number(date.seconds)).toFormat('EEE dd LLL HH:mm')
}

export const formatToRelativeDateTime = (date: Timestamp | undefined): string => {
  if (!date) return ''
  const relative = DateTime.fromSeconds(Number(date.seconds)).toRelative()
  if (relative === '0 seconds ago') return 'Just now'
  return relative
}
