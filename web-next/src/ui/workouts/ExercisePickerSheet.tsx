import type { Exercise } from '@/proto/api/v1/shared_pb'

import { MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { listExercises } from '@/http/requests'
import { AppSheet } from '@/ui/components/AppSheet'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { ExerciseTags } from '@/ui/exercises/ExerciseTags'
import { appendPage } from '@/utils/appendPage'
import { usePagination } from '@/utils/usePagination'
import styles from './ExercisePickerSheet.module.css'

interface Props {
  /** Exercises already in the session, which are not offered again. */
  excluded: readonly string[]
  onAdd: (exercise: Exercise) => void
  onClose: () => void
}

/**
 * Adds an exercise to the session in progress, for this workout only.
 *
 * Searching filters what has already been fetched rather than asking the API
 * again: the list is short enough for that, and it keeps the field responsive
 * between keystrokes.
 */
export const ExercisePickerSheet = ({ excluded, onAdd, onClose }: Props) => {
  const { t } = useTranslation()

  const [options, setOptions] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const { currentPageToken, hasMorePages, setFromResponse } = usePagination()

  const fetchPage = useCallback(async () => {
    const res = await listExercises(currentPageToken())
    if (!res) return

    setOptions((current) => appendPage(current, res.exercises))
    setFromResponse(res.pagination)
    setLoaded(true)
  }, [currentPageToken, setFromResponse])

  useEffect(() => {
    const load = async () => {
      await fetchPage()
      setLoading(false)
    }
    void load()
  }, [fetchPage])

  const loadMore = () => {
    setLoading(true)
    void fetchPage().finally(() => setLoading(false))
  }

  const query = search.trim().toLowerCase()
  const available = options.filter(
    (exercise) =>
      !excluded.includes(exercise.id) &&
      (!query || [exercise.name, ...exercise.tags].join(' ').toLowerCase().includes(query)),
  )

  return (
    <AppSheet
      eyebrow={t('workout.onlyThisWorkout')}
      title={t('workout.addExercise')}
      closeLabel={t('workout.closeExercisePicker')}
      onClose={onClose}
    >
      <label className={styles.exerciseSearch}>
        <MagnifyingGlassIcon aria-hidden="true" />
        <input
          type="search"
          value={search}
          placeholder={t('exercise.search')}
          aria-label={t('exercise.search')}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>

      {loading && !loaded ? (
        <AppSkeleton />
      ) : available.length ? (
        <div className={styles.exerciseOptions}>
          {available.map((exercise) => (
            <button key={exercise.id} type="button" onClick={() => onAdd(exercise)}>
              <span className="min-w-0">
                <strong>{exercise.name}</strong>
                <ExerciseTags compact tags={exercise.tags} />
              </span>
              <PlusIcon aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.pickerEmpty}>
          {search ? t('workout.noExerciseMatches') : t('workout.allExercisesAdded')}
        </div>
      )}

      {hasMorePages && (
        <button type="button" className={styles.loadMore} disabled={loading} onClick={loadMore}>
          {loading ? t('common.loading') : t('exercise.loadMore')}
        </button>
      )}
    </AppSheet>
  )
}
