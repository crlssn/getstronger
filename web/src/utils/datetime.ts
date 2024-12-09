import type { Timestamp } from '@bufbuild/protobuf/wkt'

import { DateTime } from 'luxon'

export const formatToCompactDateTime = (date: Timestamp | undefined): string => {
  if (!date) return ''
  return DateTime.fromSeconds(Number(date.seconds)).toFormat('EEE dd LLL HH:mm')
}

export const formatToShortDateTime = (date: Timestamp | undefined): string => {
  if (!date) return ''
  return DateTime.fromSeconds(Number(date.seconds)).toFormat('MMM dd, yyyy')
}

export const formatToRelativeDateTime = (date: Timestamp | undefined): string => {
  if (!date) return ''
  const relative = DateTime.fromSeconds(Number(date.seconds)).toRelative()
  if (relative === '0 seconds ago') return 'Just now'
  return relative
}

export const formatUnixToRelativeDateTime = (timestamp: bigint | undefined): string => {
  if (!timestamp) return ''
  const relative = DateTime.fromSeconds(Number(timestamp)).toRelative()
  if (relative === '0 seconds ago') return 'Just now'
  return relative
}
