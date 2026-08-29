import type { Exercise } from '@/proto/api/v1/shared_pb'

import { PlusIcon } from '@heroicons/react/24/outline'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { listExercises } from '@/http/requests'
import { AppButton } from '@/ui/components/AppButton'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppLoadMore } from '@/ui/components/AppLoadMore'
import { AppOptionRow } from '@/ui/components/AppOptionRow'
import { AppSearchField } from '@/ui/components/AppSearchField'
import { AppSheet } from '@/ui/components/AppSheet'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { ExerciseTags } from '@/ui/exercises/ExerciseTags'
import { appendPage } from '@/utils/appendPage'
import { usePagination } from '@/utils/usePagination'
import styles from './ExercisePickerSheet.module.css'

interface Props {
  /** Exercises already in the session, which are not offered again. */
  excluded?: readonly string[]
  /** Said above the title: which session, or which group, is being added to. */
  eyebrow?: string
  onAdd: (exercise: Exercise) => void
  onClose: () => void
}

/**
 * Picks an exercise: for the session in progress, or for a group of the routine
 * being built.
 *
 * Searching filters what has already been fetched rather than asking the API
 * again: the list is short enough for that, and it keeps the field responsive
 * between keystrokes.
 */
export const ExercisePickerSheet = ({ excluded = [], eyebrow, onAdd, onClose }: Props) => {
  const { t } = useTranslation()

  const [options, setOptions] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [search, setSearch] = useState('')
  const { currentPageToken, hasMorePages, setFromResponse } = usePagination()

  const fetchPage = useCallback(async () => {
    setFailed(false)
    const res = await listExercises(currentPageToken())
    if (!res) {
      setFailed(true)
      return
    }

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
      eyebrow={eyebrow ?? t('workout.onlyThisWorkout')}
      title={t('workout.addExercise')}
      closeLabel={t('workout.closeExercisePicker')}
      onClose={onClose}
    >
      <AppSearchField
        className="mb-4"
        label={t('exercise.search')}
        value={search}
        onChange={setSearch}
      />

      {loading && !loaded ? (
        <AppSkeleton />
      ) : failed && !options.length ? (
        // "All available exercises are already in this workout" for a library
        // that never arrived is the reading this picker must not offer.
        <AppErrorState onRetry={loadMore} />
      ) : available.length ? (
        <div className={styles.exerciseOptions}>
          {available.map((exercise) => (
            <AppOptionRow
              key={exercise.id}
              trailing={<PlusIcon aria-hidden="true" />}
              onClick={() => onAdd(exercise)}
            >
              <strong>{exercise.name}</strong>
              <ExerciseTags compact tags={exercise.tags} />
            </AppOptionRow>
          ))}
        </div>
      ) : !search && !options.length ? (
        // An empty library is not "everything already added": the way forward
        // is creating the first exercise, so the sheet offers it.
        <div className={styles.pickerEmpty}>
          <p>{t('workout.emptyLibrary')}</p>
          <AppButton type="link" colour="primary" width="auto" to="/exercises/create">
            {t('exercise.create')}
          </AppButton>
        </div>
      ) : (
        <div className={styles.pickerEmpty}>
          {search ? t('workout.noExerciseMatches') : t('workout.allExercisesAdded')}
        </div>
      )}

      {failed && options.length > 0 && <AppErrorState compact onRetry={loadMore} />}

      {hasMorePages && !failed && (
        <AppLoadMore
          label={loading ? t('common.loading') : t('exercise.loadMore')}
          loading={loading}
          onFetch={loadMore}
        />
      )}
    </AppSheet>
  )
}
