import type { Routine } from '@/proto/api/v1/routine_service_pb'

import {
  ChevronRightIcon,
  EllipsisHorizontalIcon,
  PlayIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { listRoutines } from '@/http/requests'
import { lastPerformedIn, useActivityStore } from '@/stores/activity'
import { useDashboardStore } from '@/stores/dashboard'
import { AppEmptyState } from '@/ui/components/AppEmptyState'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppButton } from '@/ui/components/AppButton'
import { AppLoadMore } from '@/ui/components/AppLoadMore'
import { AppPageHeader } from '@/ui/components/AppPageHeader'
import { AppSearchField } from '@/ui/components/AppSearchField'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { ExerciseTags } from '@/ui/exercises/ExerciseTags'
import { TrainingTabs } from '@/ui/features/TrainingTabs'
import { groupByRoutineActivity } from '@/utils/activityGroups'
import { appendPage } from '@/utils/appendPage'
import { usePagination } from '@/utils/usePagination'
import styles from './ListRoutines.module.css'

// Matches the estimate on the home screen's up-next card.
const minutesPerExercise = 8
const minimumEstimatedMinutes = 30
// Enough to recognise the routine; past that the row is a wall of names.
const maxNamedExercises = 3

/** Every routine, grouped by how recently it was trained. */
export const ListRoutines = () => {
  const { t } = useTranslation()
  const { hasMorePages, currentPageToken, setFromResponse } = usePagination()

  const preferredRoutineId = useDashboardStore((state) => state.preferredRoutineId)
  const routineLastPerformed = useActivityStore((state) => state.routineLastPerformed)

  const [routines, setRoutines] = useState<Routine[]>([])
  const [search, setSearch] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  const fetchRoutines = useCallback(async () => {
    setFailed(false)
    const response = await listRoutines(currentPageToken())
    if (!response) {
      setFailed(true)
      return
    }

    setRoutines((current) => appendPage(current, response.routines))
    setFromResponse(response.pagination)
  }, [currentPageToken, setFromResponse])

  useEffect(() => {
    const load = async () => {
      await Promise.all([
        fetchRoutines(),
        useDashboardStore.getState().load(),
        useActivityStore.getState().load(),
      ])
      setLoaded(true)
    }
    void load()
  }, [fetchRoutines])

  const query = search.trim().toLowerCase()
  const filtered = query
    ? routines.filter((routine) => routine.name.toLowerCase().includes(query))
    : routines

  const groups = useMemo(
    () =>
      groupByRoutineActivity(
        filtered,
        (routine) => lastPerformedIn(routineLastPerformed, routine.id),
        (routine) => routine.name,
      ),
    [filtered, routineLastPerformed],
  )

  const routineTags = (routine: Routine) => [
    ...new Set(routine.exercises.flatMap((exercise) => exercise.tags)),
  ]

  const exerciseSummary = (routine: Routine) => {
    const names = routine.exercises.slice(0, maxNamedExercises).map((exercise) => exercise.name)
    if (!names.length) return t('routine.noExercises')

    const remaining = routine.exercises.length - names.length
    return remaining > 0
      ? `${names.join(' · ')} ${t('routine.andMore', { count: remaining })}`
      : names.join(' · ')
  }

  return (
    <div className={styles.page}>
      <AppPageHeader
        action={
          <AppButton type="link" colour="primary" width="auto" to="/routines/create">
            <PlusIcon className="size-5" aria-hidden="true" /> {t('training.newRoutine')}
          </AppButton>
        }
        lead={t('training.routinesDescription')}
        title={t('training.heading')}
      />

      <TrainingTabs />

      <AppSearchField label={t('training.searchRoutines')} value={search} onChange={setSearch} />

      {!loaded ? (
        <AppSkeleton />
      ) : failed && routines.length === 0 ? (
        <AppErrorState onRetry={() => void fetchRoutines()} />
      ) : filtered.length > 0 ? (
        groups.map((group) => (
          <section key={group.bucket} className={styles.routineGroup}>
            <h2 className={styles.groupHeading}>{t(group.labelKey)}</h2>
            <div className={styles.routineGrid}>
              {group.items.map((routine) => {
                const tags = routineTags(routine)
                const performed = lastPerformedIn(routineLastPerformed, routine.id)?.toRelative()

                return (
                  <article key={routine.id} className={styles.routineCard}>
                    <div className={styles.routineHeading}>
                      <Link to={`/routines/${routine.id}`}>
                        {routine.id === preferredRoutineId && (
                          <span className={styles.upNext}>{t('home.upNext')}</span>
                        )}
                        <h3>{routine.name}</h3>
                        {tags.length > 0 ? (
                          <ExerciseTags compact tags={tags} />
                        ) : (
                          <p className={styles.routineExercises}>{exerciseSummary(routine)}</p>
                        )}
                        <p className={styles.routineMeta}>
                          <span>
                            {t('home.exerciseCount', { count: routine.exercises.length })}
                          </span>
                          <span>
                            {t('home.aboutMinutes', {
                              count: Math.max(
                                minimumEstimatedMinutes,
                                routine.exercises.length * minutesPerExercise,
                              ),
                            })}
                          </span>
                          {performed && <span>{performed}</span>}
                        </p>
                      </Link>
                      <ChevronRightIcon aria-hidden="true" />
                    </div>

                    <div className={styles.routineActions}>
                      <AppButton
                        type="link"
                        colour="primary"
                        size="sm"
                        width="auto"
                        to={`/workouts/routine/${routine.id}`}
                      >
                        <PlayIcon className="size-5" aria-hidden="true" /> {t('routine.list.start')}
                      </AppButton>
                      <AppButton
                        type="link"
                        colour="secondary"
                        size="sm"
                        width="auto"
                        to={`/routines/${routine.id}`}
                      >
                        {t('routine.list.view')}
                      </AppButton>
                      <details className={styles.routineMenu}>
                        <summary aria-label={t('routine.list.actionsAria')}>
                          <EllipsisHorizontalIcon aria-hidden="true" />
                        </summary>
                        <div>
                          <Link to={`/routines/${routine.id}/edit`}>{t('routine.list.edit')}</Link>
                          {routine.id !== preferredRoutineId && (
                            <AppButton
                              type="button"
                              colour="ghost"
                              size="sm"
                              onClick={() =>
                                void useDashboardStore.getState().selectRoutine(routine.id)
                              }
                            >
                              {t('routine.makeUpNext')}
                            </AppButton>
                          )}
                        </div>
                      </details>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ))
      ) : (
        <AppEmptyState
          action={search ? 'none' : { label: t('home.createRoutine'), to: '/routines/create' }}
          body={search ? t('exercise.tryAnotherSearch') : t('routine.list.emptyBody')}
          title={search ? t('training.noMatchingRoutines') : t('training.noRoutines')}
          actionIcon={<PlusIcon />}
        />
      )}

      {failed && routines.length > 0 ? (
        <AppErrorState compact onRetry={() => void fetchRoutines()} />
      ) : (
        hasMorePages && (
          <AppLoadMore label={t('routine.list.loadMore')} onFetch={() => void fetchRoutines()} />
        )
      )}
    </div>
  )
}
