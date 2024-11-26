import { DateTime } from 'luxon'
import type { Timestamp } from '@bufbuild/protobuf/wkt'

export const formatToCompactDateTime = (date: Timestamp | undefined): string => {
  if (!date) return ''
  return DateTime.fromSeconds(Number(date.seconds)).toFormat('EEE dd LLL HH:mm')
}
