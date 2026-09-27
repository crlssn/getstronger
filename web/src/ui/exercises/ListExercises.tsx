import type { Exercise } from '@/proto/api/v1/shared_pb'

import { PlusIcon } from '@heroicons/react/24/outline'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { listExercises } from '@/http/requests'
import { lastPerformedIn, useActivityStore } from '@/stores/activity'
import { useExercisesWithPending, usePendingExerciseIds } from '@/stores/pendingExercises'
import { AppEmptyState } from '@/ui/components/AppEmptyState'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppButton } from '@/ui/components/AppButton'
import { AppList } from '@/ui/components/AppList'
import { AppListRow } from '@/ui/components/AppListRow'
import { AppLoadMore } from '@/ui/components/AppLoadMore'
import { AppPageHeader } from '@/ui/components/AppPageHeader'
import { AppSearchField } from '@/ui/components/AppSearchField'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { groupByActivity } from '@/utils/activityGroups'
import { measurementsForExercise } from '@/utils/exerciseMeasurements'
import { usePagedList } from '@/utils/usePagedList'
import styles from './ListExercises.module.css'

/** The exercise library, grouped by when each was last trained. */
export const ListExercises = () => {
  const { t } = useTranslation()
  const {
    rows: exercises,
    loaded,
    failed,
    hasMorePages,
    fetchMore: fetchExercises,
  } = usePagedList('exercises', async (pageToken) => {
    const response = await listExercises(pageToken)
    return response && { rows: response.exercises, pagination: response.pagination }
  })

  const exerciseLastPerformed = useActivityStore((state) => state.exerciseLastPerformed)
  const activityLoaded = useActivityStore((state) => state.loaded)
  const [search, setSearch] = useState('')

  useEffect(() => {
    void useActivityStore.getState().load()
  }, [])

  // The groups are drawn from both, so a list without its activity would jump.
  const loading = !loaded || !activityLoaded

  const library = useExercisesWithPending(exercises)
  const pendingIds = usePendingExerciseIds()
  const query = search.trim().toLowerCase()
  const filtered = query
    ? library.filter((exercise) =>
        [exercise.name, ...exercise.tags].join(' ').toLowerCase().includes(query),
      )
    : library

  const groups = useMemo(
    () =>
      groupByActivity(
        filtered,
        (exercise) => lastPerformedIn(exerciseLastPerformed, exercise.id),
        (exercise) => exercise.name,
      ),
    [filtered, exerciseLastPerformed],
  )

  // The row's meta line: how the exercise is tracked, then where it bites —
  // "Weight × Reps · Back, legs". Both halves already live on the exercise.
  const exerciseMeta = (exercise: Exercise) =>
    [
      measurementsForExercise(exercise)
        .map(({ labelKey }) => t(labelKey))
        .join(' × '),
      exercise.tags.join(', '),
    ]
      .filter(Boolean)
      .join(' · ')

  return (
    <div className={styles.page}>
      <AppPageHeader
        action={
          <AppButton type="link" colour="primary" width="auto" to="/exercises/create">
            <PlusIcon className="size-5" aria-hidden="true" /> {t('exercise.new')}
          </AppButton>
        }
        title={t('exercise.heading')}
      />

      <AppSearchField label={t('exercise.search')} value={search} onChange={setSearch} />

      {loading ? (
        <AppSkeleton />
      ) : failed && library.length === 0 ? (
        <AppErrorState onRetry={() => void fetchExercises()} />
      ) : filtered.length > 0 ? (
        <section className={styles.exerciseList}>
          {groups.map((group) => (
            <section key={group.bucket} className={styles.exerciseGroup}>
              <h2>{t(group.labelKey)}</h2>
              <AppList className={styles.exerciseGroupCard}>
                {group.items.map((exercise) => (
                  <AppListRow
                    key={exercise.id}
                    meta={<small>{exerciseMeta(exercise)}</small>}
                    title={exercise.name}
                    // Its page would ask the backend for an exercise it lacks.
                    to={pendingIds.has(exercise.id) ? undefined : `/exercises/${exercise.id}`}
                  />
                ))}
              </AppList>
            </section>
          ))}

          {failed ? (
            <AppErrorState compact onRetry={() => void fetchExercises()} />
          ) : (
            hasMorePages && (
              <AppLoadMore label={t('exercise.loadMore')} onFetch={() => void fetchExercises()} />
            )
          )}
        </section>
      ) : (
        <AppEmptyState
          action={search ? 'none' : { label: t('exercise.new'), to: '/exercises/create' }}
          body={search ? t('exercise.tryAnotherSearch') : t('exercise.emptyBody')}
          title={search ? t('exercise.noMatches') : t('exercise.empty')}
          actionIcon={<PlusIcon />}
        />
      )}
    </div>
  )
}
