import type { Workout } from '@/proto/api/v1/workout_service_pb'
import { AppIconButton } from '@/ui/components/AppIconButton'
import { AppTextarea } from '@/ui/components/AppTextarea'
import type { Timestamp } from '@bufbuild/protobuf/wkt'

import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { Bars3Icon } from '@heroicons/react/24/outline'
import { DateTime } from 'luxon'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { getWorkout, updateWorkout } from '@/http/requests'
import { SetSchema } from '@/proto/api/v1/shared_pb'
import { useToastStore } from '@/stores/toasts'
import { useAuthStore } from '@/stores/auth'
import { usePageTitleStore } from '@/stores/pageTitle'
import { AppButton } from '@/ui/components/AppButton'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppFormFooter } from '@/ui/components/AppFormFooter'
import { AppList } from '@/ui/components/AppList'
import { AppListItemInput } from '@/ui/components/AppListItemInput'
import { AppOptionalAction } from '@/ui/components/AppOptionalAction'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { ExerciseTags } from '@/ui/exercises/ExerciseTags'
import { SetTable } from '@/ui/workouts/SetTable'
import { normalizeDistanceUnit } from '@/utils/distanceUnits'
import { isExerciseSetComplete } from '@/utils/exerciseMeasurements'
import { useSortable } from '@/utils/useSortable'
import { normalizeWeightUnit } from '@/utils/weightUnits'
import styles from './EditWorkout.module.css'

const localInput = "yyyy-MM-dd'T'HH:mm"

const toLocalInput = (timestamp: Timestamp | undefined) =>
  timestamp
    ? DateTime.fromSeconds(Number(timestamp.seconds)).toFormat(localInput)
    : DateTime.now().toFormat(localInput)

/** Corrects a finished workout: its sets, when it ran, and the note on it. */
export const EditWorkout = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id = '' } = useParams()

  const [workout, setWorkout] = useState<Workout>()
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    const res = await getWorkout(id)
    if (!res) {
      setFailed(true)
      return
    }

    // Editing someone else's workout is refused here as well as by the API,
    // so the form is never shown for one.
    if (res.workout?.user?.id !== useAuthStore.getState().userId) {
      useToastStore.getState().error(t('workout.edit.noPermission'))
      await navigate('/home')
      return
    }

    setFailed(false)
    setWorkout(res.workout)
    usePageTitleStore.getState().setPageTitle(res.workout.name)
  }, [id, t, navigate])

  useEffect(() => {
    const initialLoad = async () => {
      await load()
    }
    void initialLoad()
  }, [load])

  const onSubmit = async () => {
    if (!workout) return

    // A set left half-filled is dropped rather than saved as a real one, and an
    // exercise with nothing left in it goes with them.
    const exerciseSets = workout.exerciseSets
      .map((exerciseSet) => ({
        ...exerciseSet,
        sets: exerciseSet.sets.filter((set) => isExerciseSetComplete(set, exerciseSet.exercise)),
      }))
      .filter((exerciseSet) => exerciseSet.sets.length > 0)

    const res = await updateWorkout({ ...workout, exerciseSets })
    if (!res) return

    useToastStore.getState().success(t('workout.edit.updated'))
    await navigate(`/workouts/${workout.id}`)
  }

  const updateSets = (
    exerciseIndex: number,
    change: (
      sets: Workout['exerciseSets'][number]['sets'],
    ) => Workout['exerciseSets'][number]['sets'],
  ) =>
    setWorkout((current) => {
      if (!current) return current

      const exerciseSets = current.exerciseSets.map((exerciseSet, index) =>
        index === exerciseIndex ? { ...exerciseSet, sets: change(exerciseSet.sets) } : exerciseSet,
      )
      return { ...current, exerciseSets }
    })

  const moveExercise = (from: number, to: number) =>
    setWorkout((current) => {
      if (!current) return current
      if (to < 0 || to >= current.exerciseSets.length) return current

      const exerciseSets = [...current.exerciseSets]
      const [moved] = exerciseSets.splice(from, 1)
      if (moved) exerciseSets.splice(to, 0, moved)
      return { ...current, exerciseSets }
    })

  // The same handle every other reorderable list in the app uses, dragged or
  // moved with the arrow keys. A pair of chevrons on the section header was a
  // third way of saying "this can move".
  const order = useSortable<HTMLOListElement>(
    {
      handle: `.${styles.dragHandle}`,
      ghostClass: styles.sortableGhost,
      dragClass: styles.sortableDrag,
      animation: 150,
      onReorder: moveExercise,
    },
    (workout?.exerciseSets.length ?? 0) > 1,
  )

  // The form is only mounted with the workout in hand, so without this the
  // screen keeps pulsating at a fetch that is never coming back.
  if (failed) return <AppErrorState onRetry={() => void load()} />
  if (!workout) return <AppSkeleton />

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit()
      }}
    >
      <ol ref={order}>
        {workout.exerciseSets.map((exerciseSet, exerciseIndex) => (
          <li key={exerciseSet.exercise?.id}>
            <div className={styles.exerciseHeading}>
              <div>
                <h2>{exerciseSet.exercise?.name}</h2>
                <ExerciseTags compact tags={exerciseSet.exercise?.tags} />
              </div>
              <div className={styles.moveActions}>
                <AppIconButton
                  className={styles.dragHandle}
                  icon={Bars3Icon}
                  label={t('training.planForm.reorder', { name: exerciseSet.exercise?.name })}
                />
              </div>
            </div>

            {/* The same table the session was logged in. It used to be a
              stacked block per set — "SET 1" over a labelled Weight and a
              labelled Reps — at roughly three times the height, which made
              correcting a workout a screen nobody recognised. */}
            <div className={styles.setTable}>
              {exerciseSet.exercise && (
                <SetTable
                  distanceUnit={normalizeDistanceUnit(workout.user?.distanceUnit)}
                  exercise={exerciseSet.exercise}
                  mode="edit"
                  sets={exerciseSet.sets}
                  weightUnit={normalizeWeightUnit(workout.user?.weightUnit)}
                  onChange={(setIndex, changes) =>
                    updateSets(exerciseIndex, (sets) =>
                      sets.map((candidate, index) =>
                        index === setIndex ? { ...candidate, ...changes } : candidate,
                      ),
                    )
                  }
                  onRemove={(setIndex) =>
                    updateSets(exerciseIndex, (sets) =>
                      sets.filter((_, index) => index !== setIndex),
                    )
                  }
                />
              )}

              <AppOptionalAction
                label={t('workout.edit.addSet')}
                onClick={() =>
                  updateSets(exerciseIndex, (sets) => [
                    ...sets,
                    create(SetSchema, {
                      weightUnit: normalizeWeightUnit(workout.user?.weightUnit),
                      distanceUnit: normalizeDistanceUnit(workout.user?.distanceUnit),
                    }),
                  ])
                }
              />
            </div>
          </li>
        ))}
      </ol>

      {/* Each field is labelled by the row it fills, so the label that used
          to float above it said the same thing twice. */}
      <AppList>
        <AppListItemInput
          label={t('workout.edit.startTime')}
          model={toLocalInput(workout.startedAt)}
          type="datetime-local"
          required
          onUpdate={(value) =>
            setWorkout((current) =>
              current
                ? { ...current, startedAt: timestampFromDate(DateTime.fromISO(value).toJSDate()) }
                : current,
            )
          }
        />
      </AppList>

      <AppList>
        <AppListItemInput
          label={t('workout.edit.endTime')}
          model={toLocalInput(workout.finishedAt)}
          type="datetime-local"
          required
          onUpdate={(value) =>
            setWorkout((current) =>
              current
                ? { ...current, finishedAt: timestampFromDate(DateTime.fromISO(value).toJSDate()) }
                : current,
            )
          }
        />
      </AppList>

      <AppTextarea
        autosize
        aria-label={t('workout.edit.note')}
        className={styles.note}
        placeholder={t('workout.notePlaceholder')}
        rows={3}
        value={workout.note}
        onChange={(event) =>
          setWorkout((current) => (current ? { ...current, note: event.target.value } : current))
        }
      />

      <AppFormFooter
        secondary={
          <AppButton
            type="link"
            to={`/workouts/${workout.id}`}
            colour="ghost"
            size="lg"
            width="auto"
          >
            {t('common.cancel')}
          </AppButton>
        }
      >
        <AppButton type="submit" colour="primary" size="lg">
          {t('common.saveChanges')}
        </AppButton>
      </AppFormFooter>
    </form>
  )
}
