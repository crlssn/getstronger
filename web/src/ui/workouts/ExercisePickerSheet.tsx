import type { Exercise } from '@/proto/api/v1/shared_pb'
import type { ReactNode } from 'react'

import { PlusIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import { AppButton } from '@/ui/components/AppButton'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppLoadMore } from '@/ui/components/AppLoadMore'
import { AppOptionRow } from '@/ui/components/AppOptionRow'
import { AppSearchField } from '@/ui/components/AppSearchField'
import { AppSheet } from '@/ui/components/AppSheet'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { ExerciseTags } from '@/ui/exercises/ExerciseTags'
import { useExerciseLibrary } from '@/utils/useExerciseLibrary'
import styles from './ExercisePickerSheet.module.css'

interface Props {
  /** Exercises already in the session, which are not offered again. */
  excluded?: readonly string[]
  /** Said above the title: which session, or which block, is being added to. */
  eyebrow?: string
  /**
   * Asked before the search field: anything the caller needs answered about the
   * exercise before it is picked, such as how a routine will count its work.
   */
  header?: ReactNode
  onAdd: (exercise: Exercise) => void
  onClose: () => void
}

/**
 * Picks an exercise: for the session in progress, or for a group of the routine
 * being built. The library, its paging and its search come from
 * `useExerciseLibrary`; what this sheet adds is leaving out what is already in
 * the session.
 */
export const ExercisePickerSheet = ({ excluded = [], eyebrow, header, onAdd, onClose }: Props) => {
  const { t } = useTranslation()
  const {
    options,
    loading,
    loaded,
    failed,
    search,
    setSearch,
    matchesSearch,
    hasMorePages,
    loadMore,
  } = useExerciseLibrary()

  const available = options.filter(
    (exercise) => !excluded.includes(exercise.id) && matchesSearch(exercise),
  )

  return (
    <AppSheet
      eyebrow={eyebrow ?? t('workout.onlyThisWorkout')}
      title={t('workout.addExercise')}
      closeLabel={t('workout.closeExercisePicker')}
      onClose={onClose}
    >
      {header}

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
