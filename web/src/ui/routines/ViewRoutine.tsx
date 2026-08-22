import type { Routine } from '@/proto/api/v1/routine_service_pb'
import type { ExerciseSets } from '@/proto/api/v1/shared_pb'

import {
  Bars3Icon,
  ClockIcon,
  PencilIcon,
  PlayIcon,
  StarIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import {
  deleteRoutine,
  getPreviousWorkoutSets,
  getRoutine,
  updateExerciseOrder,
} from '@/http/requests'
import { useConfirmationStore } from '@/stores/confirmation'
import { useDashboardStore } from '@/stores/dashboard'
import { usePageTitleStore } from '@/stores/pageTitle'
import { useToastStore } from '@/stores/toasts'
import { AppButton } from '@/ui/components/AppButton'
import { AppIconButton } from '@/ui/components/AppIconButton'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { ExerciseTags } from '@/ui/exercises/ExerciseTags'
import { formatExerciseSet } from '@/utils/exerciseMeasurements'
import { useSortable } from '@/utils/useSortable'
import styles from './ViewRoutine.module.css'

// Matches the estimate on the home screen's up-next card.
const minutesPerExercise = 8
const minimumEstimatedMinutes = 30

/** One routine: what is in it, in what order, and what to do with it. */
export const ViewRoutine = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id = '' } = useParams()

  const preferredRoutineId = useDashboardStore((state) => state.preferredRoutineId)

  const [routine, setRoutine] = useState<Routine>()
  const [previousSets, setPreviousSets] = useState<ExerciseSets[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const response = await getRoutine(id)
      setRoutine(response?.routine)
      usePageTitleStore.getState().setPageTitle(response?.routine?.name ?? t('common.routine'))
      setLoading(false)

      if (!response?.routine) return

      const previous = await getPreviousWorkoutSets(
        response.routine.exercises.map((exercise) => exercise.id),
      )
      if (previous) setPreviousSets(previous.exerciseSets)
    }
    void load()
  }, [id, t])

  // SortableJS moves the rows itself; the state is reordered to match so React
  // renders the same order it is already looking at.
  const list = useSortable<HTMLOListElement>(
    {
      handle: `.${styles.dragHandle}`,
      ghostClass: styles.sortableGhost,
      dragClass: styles.sortableDrag,
      // The request is made here rather than inside the state updater, which
      // React is free to run more than once.
      onReorder: (from, to) => {
        if (!routine) return

        const exercises = [...routine.exercises]
        const [moved] = exercises.splice(from, 1)
        if (moved) exercises.splice(to, 0, moved)

        setRoutine({ ...routine, exercises })
        void updateExerciseOrder(
          routine.id,
          exercises.map((exercise) => exercise.id),
        )
      },
    },
    Boolean(routine),
  )

  // Ten rows of Plank / Rows / Rows with no numbers on them is a list nobody
  // can scan, and two routines both called Arms are indistinguishable until you
  // open them. What someone is looking for here is the load, so the row carries
  // it.
  const lastSession = (exerciseId: string) => {
    const entry = previousSets.find((previous) => previous.exercise?.id === exerciseId)
    const sets = entry?.sets ?? []
    if (!sets.length) return ''

    const heaviest = sets.reduce((top, set) =>
      Number(set.weight) > Number(top.weight) ? set : top,
    )
    return t('routine.view.lastSession', {
      sets: t('workout.setsCompact', { count: sets.length }),
      value: formatExerciseSet(heaviest, entry?.exercise),
    })
  }

  const makeUpNext = async () => {
    if (!routine) return
    await useDashboardStore.getState().selectRoutine(routine.id)
    useToastStore.getState().success(t('routine.upNextToast', { name: routine.name }))
  }

  const onDeleteRoutine = async () => {
    if (!routine) return

    const confirmed = await useConfirmationStore.getState().confirm({
      body: t('routine.deleteConfirmBody'),
      confirmLabel: t('common.delete'),
      destructive: true,
      title: t('routine.deleteConfirmTitle', { name: routine.name }),
    })
    if (!confirmed) return

    const response = await deleteRoutine(routine.id)
    if (!response) {
      useToastStore.getState().error(t('routine.deleteFailed'))
      return
    }

    useToastStore.getState().success(t('routine.deleted'))
    await navigate('/routines')
  }

  if (loading) return <AppSkeleton />
  if (!routine) return null

  const isUpNext = routine.id === preferredRoutineId

  return (
    <div className={styles.routineDetail}>
      <section className={styles.routineHero}>
        <div>
          {isUpNext && <span className={styles.statusPill}>{t('home.upNext')}</span>}
          <p className={styles.summary}>
            <ClockIcon aria-hidden="true" />{' '}
            {t('home.exerciseCount', { count: routine.exercises.length })} ·{' '}
            {t('home.aboutMinutes', {
              count: Math.max(
                minimumEstimatedMinutes,
                routine.exercises.length * minutesPerExercise,
              ),
            })}
          </p>
        </div>
        <div className={styles.heroActions}>
          <AppButton
            type="link"
            colour="primary"
            width="auto"
            to={`/workouts/routine/${routine.id}`}
          >
            <PlayIcon className="size-5" aria-hidden="true" /> {t('workout.start')}
          </AppButton>
          {!isUpNext && (
            <AppButton
              type="button"
              colour="secondary"
              width="auto"
              onClick={() => void makeUpNext()}
            >
              <StarIcon className="size-5" aria-hidden="true" /> {t('routine.makeUpNext')}
            </AppButton>
          )}
        </div>
      </section>

      <section className={styles.exerciseSection}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>{t('routine.view.orderTitle')}</h2>
            <p>{t('routine.view.orderHelp')}</p>
          </div>
          <AppButton
            type="link"
            colour="ghost"
            size="sm"
            width="auto"
            to={`/routines/${routine.id}/edit`}
          >
            <PencilIcon className="size-5" aria-hidden="true" /> {t('routine.view.editExercises')}
          </AppButton>
        </div>

        <ol ref={list} className={styles.exerciseList}>
          {routine.exercises.map((exercise, index) => {
            const summary = lastSession(exercise.id)

            return (
              <li key={exercise.id} data-id={exercise.id}>
                <span className={styles.number}>{index + 1}</span>
                <span className={styles.exerciseCopy}>
                  <strong>{exercise.name}</strong>
                  {summary ? (
                    <small>{summary}</small>
                  ) : (
                    <ExerciseTags compact tags={exercise.tags} />
                  )}
                </span>
                <AppIconButton
                  className={styles.dragHandle}
                  icon={Bars3Icon}
                  label={t('routine.view.reorderAria')}
                />
              </li>
            )
          })}
        </ol>
      </section>

      <section className={styles.dangerZone}>
        <div>
          <h2>{t('routine.view.deleteTitle')}</h2>
          <p>{t('routine.view.deleteBody')}</p>
        </div>
        <AppButton
          type="button"
          colour="destructive"
          size="sm"
          width="auto"
          className={styles.deleteRoutine}
          onClick={() => void onDeleteRoutine()}
        >
          <TrashIcon className="size-5" aria-hidden="true" /> {t('common.delete')}
        </AppButton>
      </section>
    </div>
  )
}
