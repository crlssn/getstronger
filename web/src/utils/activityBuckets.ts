import { DateTime } from 'luxon'

export type ActivityBucket = 'today' | 'week' | 'month' | 'older' | 'never'

/** Ordered most-recent first; render groups in this order. */
export const activityBucketOrder: ActivityBucket[] = ['today', 'week', 'month', 'older', 'never']

export const activityBucketLabelKey = (bucket: ActivityBucket) => `activity.${bucket}`

/**
 * Buckets a last-performed timestamp for grouping.
 *
 * Boundaries are calendar-day based so "today" means today, not the last 24
 * hours: something logged at 23:00 yesterday should not read as today.
 */
export const activityBucketFor = (
  performedAt: DateTime | undefined,
  now: DateTime = DateTime.now(),
): ActivityBucket => {
  if (!performedAt?.isValid) return 'never'

  const startOfToday = now.startOf('day')
  const performedDay = performedAt.startOf('day')
  const daysAgo = startOfToday.diff(performedDay, 'days').days

  // Future timestamps (clock skew) read as today rather than falling through.
  if (daysAgo <= 0) return 'today'
  if (daysAgo <= 7) return 'week'
  if (daysAgo <= 30) return 'month'
  return 'older'
}
