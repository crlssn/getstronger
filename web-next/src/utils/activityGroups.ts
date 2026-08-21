import type { ActivityBucket, RoutineActivityBucket } from '@/utils/activityBuckets'
import type { DateTime } from 'luxon'

import {
  activityBucketFor,
  activityBucketLabelKey,
  activityBucketOrder,
  routineActivityBucketFor,
  routineActivityBucketLabelKey,
  routineActivityBucketOrder,
} from '@/utils/activityBuckets'

export interface ActivityGroup<T, B> {
  bucket: B
  labelKey: string
  items: T[]
}

// Numeric so "Row 2" follows "Row 1" rather than "Row 10"; base sensitivity so
// case and accents do not split otherwise-identical names.
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

interface Buckets<B> {
  order: readonly B[]
  bucketFor: (performedAt: DateTime | undefined) => B
  labelKeyFor: (bucket: B) => string
}

const group = <T, B>(
  { order, bucketFor, labelKeyFor }: Buckets<B>,
  items: readonly T[],
  lastPerformedFor: (item: T) => DateTime | undefined,
  nameOf: (item: T) => string,
): ActivityGroup<T, B>[] => {
  const buckets = new Map<B, { item: T; performedAt?: number }[]>()

  for (const item of items) {
    const performedAt = lastPerformedFor(item)
    const entry = { item, performedAt: performedAt?.toMillis() }
    const existing = buckets.get(bucketFor(performedAt))
    if (existing) existing.push(entry)
    else buckets.set(bucketFor(performedAt), [entry])
  }

  return order
    .filter((bucket) => buckets.has(bucket))
    .map((bucket) => ({
      bucket,
      labelKey: labelKeyFor(bucket),
      items: (buckets.get(bucket) ?? [])
        .sort((first, second) =>
          first.performedAt === second.performedAt
            ? byName.compare(nameOf(first.item), nameOf(second.item))
            : (second.performedAt ?? 0) - (first.performedAt ?? 0),
        )
        .map((entry) => entry.item),
    }))
}

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
): ActivityGroup<T, ActivityBucket>[] =>
  group(
    {
      order: activityBucketOrder,
      bucketFor: activityBucketFor,
      labelKeyFor: activityBucketLabelKey,
    },
    items,
    lastPerformedFor,
    nameOf,
  )

/**
 * The same, on the routine buckets.
 *
 * A routine unused for a month joins the untried ones: both are things to pick
 * up again, and splitting them leaves two thin groups saying the same thing.
 */
export const groupByRoutineActivity = <T>(
  items: readonly T[],
  lastPerformedFor: (item: T) => DateTime | undefined,
  nameOf: (item: T) => string,
): ActivityGroup<T, RoutineActivityBucket>[] =>
  group(
    {
      order: routineActivityBucketOrder,
      bucketFor: routineActivityBucketFor,
      labelKeyFor: routineActivityBucketLabelKey,
    },
    items,
    lastPerformedFor,
    nameOf,
  )
