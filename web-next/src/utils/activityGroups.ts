import type { ActivityBucket } from '@/utils/activityBuckets'
import type { DateTime } from 'luxon'

import {
  activityBucketFor,
  activityBucketLabelKey,
  activityBucketOrder,
} from '@/utils/activityBuckets'

export interface ActivityGroup<T> {
  bucket: ActivityBucket
  labelKey: string
  items: T[]
}

// Numeric so "Row 2" follows "Row 1" rather than "Row 10"; base sensitivity so
// case and accents do not split otherwise-identical names.
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/**
 * Groups items by when they were last performed, most recent group first.
 *
 * Inside a group the newest sits on top; items never performed have no date to
 * sort by, so they fall back to name order.
 */
export const groupByActivity = <T>(
  items: readonly T[],
  lastPerformedFor: (item: T) => DateTime | undefined,
  nameOf: (item: T) => string,
): ActivityGroup<T>[] => {
  const buckets = new Map<ActivityBucket, { item: T; performedAt?: number }[]>()

  for (const item of items) {
    const performedAt = lastPerformedFor(item)
    const bucket = activityBucketFor(performedAt)
    const entry = { item, performedAt: performedAt?.toMillis() }
    const group = buckets.get(bucket)
    if (group) group.push(entry)
    else buckets.set(bucket, [entry])
  }

  return activityBucketOrder
    .filter((bucket) => buckets.has(bucket))
    .map((bucket) => ({
      bucket,
      labelKey: activityBucketLabelKey(bucket),
      items: (buckets.get(bucket) ?? [])
        .sort((first, second) =>
          first.performedAt === second.performedAt
            ? byName.compare(nameOf(first.item), nameOf(second.item))
            : (second.performedAt ?? 0) - (first.performedAt ?? 0),
        )
        .map((entry) => entry.item),
    }))
}
