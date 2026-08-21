import type { Workout } from '@/proto/api/v1/workout_service_pb'
import type { SetChanges } from '@/ui/workouts/SetMeasurementInputs'
import type { Timestamp } from '@bufbuild/protobuf/wkt'

import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'
import { DateTime } from 'luxon'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { getWorkout, updateWorkout } from '@/http/requests'
import { SetSchema } from '@/proto/api/v1/shared_pb'
import { useAlertStore } from '@/stores/alerts'
import { useAuthStore } from '@/stores/auth'
import { usePageTitleStore } from '@/stores/pageTitle'
import { AppButton } from '@/ui/components/AppButton'
import { AppList } from '@/ui/components/AppList'
import { AppListItem } from '@/ui/components/AppListItem'
import { AppListItemInput } from '@/ui/components/AppListItemInput'
import { AppOptionalAction } from '@/ui/components/AppOptionalAction'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { ExerciseTags } from '@/ui/exercises/ExerciseTags'
import { SetMeasurementInputs } from '@/ui/workouts/SetMeasurementInputs'
import { normalizeDistanceUnit } from '@/utils/distanceUnits'
import { isExerciseSetComplete } from '@/utils/exerciseMeasurements'
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

  useEffect(() => {
    const load = async () => {
      const res = await getWorkout(id)
      if (!res) return

      // Editing someone else's workout is refused here as well as by the API,
      // so the form is never shown for one.
      if (res.workout?.user?.id !== useAuthStore.getState().userId) {
        useAlertStore.getState().setError(t('workout.edit.noPermission'))
        await navigate('/home')
        return
      }

      setWorkout(res.workout)
      usePageTitleStore.getState().setPageTitle(res.workout.name)
    }
    void load()
  }, [id, t, navigate])

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

    useAlertStore.getState().setSuccess(t('workout.edit.updated'))
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

  const moveExercise = (index: number, direction: -1 | 1) =>
    setWorkout((current) => {
      if (!current) return current

      const target = index + direction
      if (target < 0 || target >= current.exerciseSets.length) return current

      const exerciseSets = [...current.exerciseSets]
      const [moved] = exerciseSets.splice(index, 1)
      if (moved) exerciseSets.splice(target, 0, moved)
      return { ...current, exerciseSets }
    })

  if (!workout) return <AppSkeleton />

  return (
    <form
      className={styles.editWorkoutForm}
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit()
      }}
    >
      {workout.exerciseSets.map((exerciseSet, exerciseIndex) => (
        <div key={exerciseSet.exercise?.id}>
          <div className={styles.exerciseHeading}>
            <div>
              <h6>{exerciseSet.exercise?.name}</h6>
              <ExerciseTags compact tags={exerciseSet.exercise?.tags} />
            </div>
            <div className={styles.moveActions}>
              {exerciseIndex > 0 && (
                <button
                  type="button"
                  aria-label={t('training.planForm.moveUp', { name: exerciseSet.exercise?.name })}
                  onClick={() => moveExercise(exerciseIndex, -1)}
                >
                  <ChevronUpIcon aria-hidden="true" />
                </button>
              )}
              {exerciseIndex < workout.exerciseSets.length - 1 && (
                <button
                  type="button"
                  aria-label={t('training.planForm.moveDown', { name: exerciseSet.exercise?.name })}
                  onClick={() => moveExercise(exerciseIndex, 1)}
                >
                  <ChevronDownIcon aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <AppList>
            <AppListItem className="flex flex-col">
              {exerciseSet.sets.map((set, setIndex) => (
                <div key={setIndex} className="w-full">
                  <label className={styles.setLabel}>
                    {t('common.set')} {setIndex + 1}
                  </label>
                  <SetMeasurementInputs
                    set={set}
                    exercise={exerciseSet.exercise}
                    removeLabel={t('workout.removeSet', { number: setIndex + 1 })}
                    onChange={(changes: SetChanges) =>
                      updateSets(exerciseIndex, (sets) =>
                        sets.map((candidate, index) =>
                          index === setIndex ? { ...candidate, ...changes } : candidate,
                        ),
                      )
                    }
                    onRemove={() =>
                      updateSets(exerciseIndex, (sets) =>
                        sets.filter((_, index) => index !== setIndex),
                      )
                    }
                  />
                </div>
              ))}

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
            </AppListItem>
          </AppList>
        </div>
      ))}

      <h6>{t('workout.edit.startTime')}</h6>
      <AppList>
        <AppListItemInput
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

      <h6>{t('workout.edit.endTime')}</h6>
      <AppList>
        <AppListItemInput
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

      <h6>{t('workout.edit.note')}</h6>
      <textarea
        className={styles.note}
        placeholder={t('workout.notePlaceholder')}
        value={workout.note}
        onChange={(event) =>
          setWorkout((current) => (current ? { ...current, note: event.target.value } : current))
        }
      />

      <footer className={styles.updateDock}>
        <AppButton type="submit" colour="primary">
          {t('workout.edit.submit')}
        </AppButton>
        <AppButton type="link" to={`/workouts/${workout.id}`} colour="secondary">
          {t('common.cancel')}
        </AppButton>
      </footer>
    </form>
  )
}
