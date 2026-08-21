import type { Exercise } from '@/proto/api/v1/shared_pb'

import {
  BookOpenIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { listExercises } from '@/http/requests'
import { lastPerformedIn, useActivityStore } from '@/stores/activity'
import { AppEmptyState } from '@/ui/components/AppEmptyState'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { groupByActivity } from '@/utils/activityGroups'
import { measurementsForExercise } from '@/utils/exerciseMeasurements'
import { appendPage } from '@/utils/appendPage'
import { usePagination } from '@/utils/usePagination'
import styles from './ListExercises.module.css'

/** The exercise library, grouped by when each was last trained. */
export const ListExercises = () => {
  const { t } = useTranslation()
  const { hasMorePages, currentPageToken, setFromResponse } = usePagination()

  const exerciseLastPerformed = useActivityStore((state) => state.exerciseLastPerformed)

  const [exercises, setExercises] = useState<Exercise[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchExercises = useCallback(async () => {
    const response = await listExercises(currentPageToken())
    if (!response) return

    setExercises((current) => appendPage(current, response.exercises))
    setFromResponse(response.pagination)
  }, [currentPageToken, setFromResponse])

  useEffect(() => {
    const load = async () => {
      await Promise.all([fetchExercises(), useActivityStore.getState().load()])
      setLoading(false)
    }
    void load()
  }, [fetchExercises])

  const query = search.trim().toLowerCase()
  const filtered = query
    ? exercises.filter((exercise) =>
        [exercise.name, ...exercise.tags].join(' ').toLowerCase().includes(query),
      )
    : exercises

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
      <header className={styles.pageIntro}>
        <div>
          <h1>{t('exercise.heading')}</h1>
        </div>
        <Link to="/exercises/create" className={styles.createLink}>
          <PlusIcon aria-hidden="true" /> {t('exercise.new')}
        </Link>
      </header>

      <label className={styles.searchField}>
        <MagnifyingGlassIcon aria-hidden="true" />
        <input
          type="search"
          placeholder={t('exercise.search')}
          aria-label={t('exercise.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>

      {loading ? (
        <AppSkeleton />
      ) : filtered.length > 0 ? (
        <section className={styles.exerciseList}>
          {groups.map((group) => (
            <section key={group.bucket} className={styles.exerciseGroup}>
              <h2>{t(group.labelKey)}</h2>
              <div className={styles.exerciseGroupCard}>
                {group.items.map((exercise) => (
                  <Link key={exercise.id} to={`/exercises/${exercise.id}`}>
                    <span className={styles.exerciseCopy}>
                      <strong>{exercise.name}</strong>
                      <small>{exerciseMeta(exercise)}</small>
                    </span>
                    <ChevronRightIcon aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </section>
          ))}

          {hasMorePages && (
            <button type="button" className={styles.loadMore} onClick={() => void fetchExercises()}>
              {t('exercise.loadMore')}
            </button>
          )}
        </section>
      ) : (
        <AppEmptyState
          action={search ? 'none' : { label: t('exercise.new'), to: '/exercises/create' }}
          body={search ? t('exercise.tryAnotherSearch') : t('exercise.emptyBody')}
          title={search ? t('exercise.noMatches') : t('exercise.empty')}
          icon={<BookOpenIcon />}
          actionIcon={<PlusIcon />}
        />
      )}
    </div>
  )
}
