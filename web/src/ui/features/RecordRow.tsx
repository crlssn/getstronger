import type { ExerciseSet } from '@/proto/api/v1/shared_pb'

import { TrophyIcon } from '@heroicons/react/24/outline'

import { AppListRow } from '@/ui/components/AppListRow'
import { ExerciseTags } from '@/ui/exercises/ExerciseTags'
import { formatTimestamp } from '@/utils/datetime'
import { formatExerciseSet } from '@/utils/exerciseMeasurements'
import styles from './RecordRow.module.css'

interface Props {
  record: ExerciseSet
}

/**
 * A personal best: which exercise, when, and what it took.
 *
 * The same record was two different objects — a trophy, a date and a chevron
 * on Progress, and a bare name with a right-aligned value on the profile tab,
 * where it was the only one of the two that did not look tappable.
 */
export const RecordRow = ({ record }: Props) => (
  <AppListRow
    leading={
      <span className={styles.trophy}>
        <TrophyIcon aria-hidden="true" />
      </span>
    }
    meta={
      <>
        <ExerciseTags compact tags={record.exercise?.tags} />
        {record.set?.metadata?.createdAt && (
          <small>{formatTimestamp(record.set.metadata.createdAt)}</small>
        )}
      </>
    }
    title={record.exercise?.name ?? ''}
    to={`/exercises/${record.exercise?.id}`}
    trailing={record.set ? formatExerciseSet(record.set, record.exercise) : undefined}
  />
)
