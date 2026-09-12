import type { Exercise } from '@/proto/api/v1/shared_pb'
import type { ExerciseFormValues } from '@/ui/exercises/ExerciseForm'

import { create } from '@bufbuild/protobuf'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import {
  consumeRequestError,
  consumeRequestNotFound,
  getExercise,
  listSets,
  updateExercise,
} from '@/http/requests'
import { ExerciseSchema } from '@/proto/api/v1/shared_pb'
import { useToastStore } from '@/stores/toasts'
import { AppButton } from '@/ui/components/AppButton'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { ExerciseForm } from '@/ui/exercises/ExerciseForm'
import { emptyPageToken } from '@/utils/usePagination'
import styles from './ExerciseForm.module.css'

export const UpdateExercise = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id = '' } = useParams()

  // Undefined until loaded rather than an empty object: a blank exercise is
  // truthy, and the form would render with no metrics before the fetch landed.
  const [exercise, setExercise] = useState<Exercise>()
  const [values, setValues] = useState<ExerciseFormValues>()
  const [loading, setLoading] = useState(true)
  // The backend refuses a measurement change on an exercise that has been
  // logged, so the form asks for a single set to find out before offering one.
  const [metricsLocked, setMetricsLocked] = useState(false)
  const [error, setError] = useState<string>()
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    const [res, logged] = await Promise.all([
      getExercise(id),
      listSets([], [id], emptyPageToken, 1),
    ])

    // A refusal, a server error and an unreachable backend all answer with
    // void, and only the first of the three means the exercise is gone.
    if (!res?.exercise) {
      setFailed(!consumeRequestNotFound())
      setLoading(false)
      return
    }

    setFailed(false)
    setExercise(res.exercise)
    setValues({
      name: res.exercise.name,
      tags: [...res.exercise.tags],
      metrics: [...res.exercise.metrics],
    })
    setMetricsLocked((logged?.sets.length ?? 0) > 0)
    setLoading(false)
  }, [id])

  useEffect(() => {
    const initialLoad = async () => {
      await load()
    }
    void initialLoad()
  }, [load])

  const onSubmit = async () => {
    if (!exercise || !values) return

    setError(undefined)
    const res = await updateExercise(create(ExerciseSchema, { ...exercise, ...values }))
    if (!res) {
      setError(consumeRequestError() ?? t('common.somethingWentWrong'))
      return
    }

    useToastStore.getState().success(t('exercise.form.updated'))
    await navigate(`/exercises/${exercise.id}`)
  }

  if (values) {
    return (
      <ExerciseForm
        values={values}
        onChange={setValues}
        metricsLocked={metricsLocked}
        onSubmit={() => void onSubmit()}
        submitLabel={t('common.saveChanges')}
        error={error}
      />
    )
  }

  if (loading) return <AppSkeleton />
  if (failed) return <AppErrorState onRetry={() => void load()} />

  return (
    <section className={styles.formStatus}>
      <h1>{t('exercise.unavailable')}</h1>
      <AppButton type="link" colour="primary" width="auto" className="mt-3" to="/exercises">
        {t('common.exercises')}
      </AppButton>
    </section>
  )
}
