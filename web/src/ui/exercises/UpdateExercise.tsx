import type { Exercise } from '@/proto/api/v1/shared_pb'
import type { ExerciseFormValues } from '@/ui/exercises/ExerciseForm'

import { create } from '@bufbuild/protobuf'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { getExercise, updateExercise } from '@/http/requests'
import { ExerciseSchema } from '@/proto/api/v1/shared_pb'
import { useToastStore } from '@/stores/toasts'
import { AppButton } from '@/ui/components/AppButton'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { ExerciseForm } from '@/ui/exercises/ExerciseForm'
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

  useEffect(() => {
    const load = async () => {
      const res = await getExercise(id)
      if (res?.exercise) {
        setExercise(res.exercise)
        setValues({
          name: res.exercise.name,
          tags: [...res.exercise.tags],
          metrics: [...res.exercise.metrics],
          restSeconds: res.exercise.restSeconds,
        })
      }
      setLoading(false)
    }
    void load()
  }, [id])

  const onSubmit = async () => {
    if (!exercise || !values) return

    const res = await updateExercise(create(ExerciseSchema, { ...exercise, ...values }))
    if (!res) return

    useToastStore.getState().success(t('exercise.form.updated'))
    await navigate(`/exercises/${exercise.id}`)
  }

  if (values) {
    return (
      <ExerciseForm
        values={values}
        onChange={setValues}
        onSubmit={() => void onSubmit()}
        submitLabel={t('exercise.update')}
      />
    )
  }

  if (loading) return <AppSkeleton />

  return (
    <section className={styles.formStatus}>
      <h1>{t('exercise.unavailable')}</h1>
      <AppButton type="link" colour="primary" width="auto" className="mt-3" to="/exercises">
        {t('common.exercises')}
      </AppButton>
    </section>
  )
}
