import { DateTime } from 'luxon'

export const formatToCompactDateTime = (date: Date | undefined): string => {
  if (!date) return ''
  return DateTime.fromJSDate(date).toFormat('EEE dd LLL HH:mm')
}
