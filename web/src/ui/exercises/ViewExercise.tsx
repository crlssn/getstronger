import type { Exercise, Set } from '@/proto/api/v1/shared_pb'
import type { DropdownItem } from '@/types/dropdown'

import { BoltIcon, ChevronRightIcon, TrashIcon, TrophyIcon } from '@heroicons/react/24/outline'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { deleteExercise, getExercise, listSets } from '@/http/requests'
import { useToastStore } from '@/stores/toasts'
import { useAuthStore } from '@/stores/auth'
import { useConfirmationStore } from '@/stores/confirmation'
import { usePageTitleStore } from '@/stores/pageTitle'
import { useWorkoutStore } from '@/stores/workout'
import { AppSheet, SheetAction } from '@/ui/components/AppSheet'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { DropdownButton } from '@/ui/components/DropdownButton'
import { ExerciseChart } from '@/ui/components/ExerciseChart'
import { PageNavAction } from '@/ui/components/PageNavAction'
import { ExerciseTags } from '@/ui/exercises/ExerciseTags'
import blurActiveElement from '@/utils/blurActiveElement'
import { formatToShortDateTime } from '@/utils/datetime'
import { formatExerciseSet } from '@/utils/exerciseMeasurements'
import { downSample } from '@/utils/exerciseTrend'
import { useActiveWorkout } from '@/utils/useActiveWorkout'
import { appendPage } from '@/utils/appendPage'
import { usePagination } from '@/utils/usePagination'
import styles from './ViewExercise.module.css'

// More points than a chart this size can show, and every one past them costs
// time without changing the shape.
const maxChartPoints = 60

/** One exercise: how it has trended, and every set ever logged against it. */
export const ViewExercise = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id = '' } = useParams()

  const userId = useAuthStore((state) => state.userId)
  const { savedRoutineName, savedWorkout } = useActiveWorkout()
  const { hasMorePages, currentPageToken, setFromResponse } = usePagination()

  const [exercise, setExercise] = useState<Exercise>()
  const [sets, setSets] = useState<Set[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchSets = useCallback(async () => {
    const response = await listSets([], [id], currentPageToken())
    if (!response) return

    setSets((current) => appendPage(current, response.sets))
    setFromResponse(response.pagination)
  }, [id, currentPageToken, setFromResponse])

  useEffect(() => {
    const load = async () => {
      const response = await getExercise(id)
      if (response?.exercise) {
        setExercise(response.exercise)
        usePageTitleStore.getState().setPageTitle(response.exercise.name)
        await fetchSets()
      }
      setLoading(false)
    }
    void load()
  }, [id, fetchSets])

  const onDeleteExercise = async () => {
    if (deleting) return
    setDeleting(true)

    try {
      const response = await deleteExercise(id)
      setDeleteDialogOpen(false)

      if (!response) {
        useToastStore.getState().error(t('exercise.view.deleteFailed'))
        return
      }

      useToastStore.getState().success(t('exercise.view.deleted'))
      await navigate('/exercises')
    } finally {
      setDeleting(false)
    }
  }

  const onStartQuickWorkout = async () => {
    if (!exercise) return

    // A quick workout replaces whatever is running, so an unfinished session is
    // never discarded without being named first.
    const activeRoutineID = savedWorkout?.[0]
    if (activeRoutineID) {
      const confirmed = await useConfirmationStore.getState().confirm({
        body: t('exercise.replaceWorkoutConfirmBody', { exercise: exercise.name }),
        confirmLabel: t('exercise.startQuickWorkout'),
        destructive: true,
        title: t('exercise.replaceWorkoutConfirmTitle', { workout: savedRoutineName }),
      })
      if (!confirmed) return

      useWorkoutStore.getState().removeWorkout(activeRoutineID)
    }

    useWorkoutStore.getState().startQuickWorkoutWithExercise(exercise)
    await navigate('/workouts/quick')
  }

  if (loading) return <AppSkeleton />

  if (!exercise) {
    return (
      <section className={styles.emptyCard}>
        <h1>{t('exercise.unavailable')}</h1>
        <p>{t('exercise.view.unavailableBody')}</p>
        <Link to="/exercises">{t('exercise.view.viewExercises')}</Link>
      </section>
    )
  }

  const isOwner = userId === exercise.userId

  const exerciseActions: DropdownItem[] = [
    { href: `/exercises/${id}/edit`, title: t('exercise.update') },
    {
      func: async () => {
        // The menu item keeps focus otherwise, and the sheet opens behind it.
        blurActiveElement()
        setDeleteDialogOpen(true)
      },
      title: t('exercise.delete'),
    },
  ]

  return (
    <div className={styles.detail}>
      {/* Management stays out of the content flow: edit and delete live in the
          page header's overflow menu so the trend and history lead the page. */}
      {isOwner && (
        <PageNavAction>
          <DropdownButton label={t('exercise.view.actionsLabel')} items={exerciseActions} />
        </PageNavAction>
      )}

      <ExerciseTags tags={exercise.tags} />

      {isOwner && (
        <button
          type="button"
          className={styles.startQuickCard}
          onClick={() => void onStartQuickWorkout()}
        >
          <span className={styles.startQuickIcon}>
            <BoltIcon aria-hidden="true" />
          </span>
          <span className={styles.startQuickCopy}>
            <strong>{t('exercise.startQuickWorkout')}</strong>
            <small>{t('exercise.startQuickWorkoutBody', { name: exercise.name })}</small>
          </span>
          <ChevronRightIcon className={styles.startQuickChevron} aria-hidden="true" />
        </button>
      )}

      {deleteDialogOpen && (
        <AppSheet
          title={t('exercise.view.deleteTitle', { name: exercise.name })}
          body={t('exercise.view.deleteBody')}
          onClose={() => setDeleteDialogOpen(false)}
          actions={
            <>
              <SheetAction
                tone="danger"
                disabled={deleting}
                onClick={() => void onDeleteExercise()}
              >
                <TrashIcon aria-hidden="true" /> {t('exercise.delete')}
              </SheetAction>
              <SheetAction tone="tertiary" onClick={() => setDeleteDialogOpen(false)}>
                {t('common.cancel')}
              </SheetAction>
            </>
          }
        />
      )}

      {sets.length > 0 && (
        <section className={styles.chartCard}>
          <p className={styles.eyebrow}>{t('exercise.trend')}</p>
          <ExerciseChart sets={downSample(sets, maxChartPoints)} exercise={exercise} />
        </section>
      )}

      <section className={styles.setsCard}>
        <header>
          <div>
            <p className={styles.eyebrow}>{t('exercise.history')}</p>
            <h2>{t('exercise.loggedSets')}</h2>
          </div>
          <span>{sets.length}</span>
        </header>

        {sets.length > 0 ? (
          <div className={styles.setList}>
            {sets.map((set) => (
              <Link key={set.id} to={`/workouts/${set.metadata?.workoutId}`}>
                <span className={styles.setCopy}>
                  <strong>{formatExerciseSet(set, exercise)}</strong>
                  <small>{formatToShortDateTime(set.metadata?.createdAt)}</small>
                </span>
                {set.metadata?.personalBest && (
                  <span className={styles.recordPill}>
                    <TrophyIcon aria-hidden="true" /> {t('exercise.view.prPill')}
                  </span>
                )}
                <ChevronRightIcon aria-hidden="true" />
              </Link>
            ))}
          </div>
        ) : (
          <p className={styles.emptyCopy}>{t('exercise.view.emptyHistory')}</p>
        )}

        {hasMorePages && (
          <button type="button" className={styles.loadMore} onClick={() => void fetchSets()}>
            {t('exercise.view.loadMoreSets')}
          </button>
        )}
      </section>
    </div>
  )
}
