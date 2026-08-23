import type { ExerciseFormValues } from '@/ui/exercises/ExerciseForm'

import { create } from '@bufbuild/protobuf'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { createExercise } from '@/http/requests'
import posthog from '@/posthog'
import { CreateExerciseRequestSchema } from '@/proto/api/v1/exercise_service_pb'
import { ExerciseMetric } from '@/proto/api/v1/shared_pb'
import { useToastStore } from '@/stores/toasts'
import { ExerciseForm } from '@/ui/exercises/ExerciseForm'

// Weight and reps: what most exercises are, so most of this form is already
// filled in.
const blankExercise: ExerciseFormValues = {
  name: '',
  tags: [],
  metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
}

export const CreateExercise = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [values, setValues] = useState(blankExercise)

  const onSubmit = async () => {
    const res = await createExercise(create(CreateExerciseRequestSchema, values))
    if (!res) return

    posthog.capture('exercise_created')
    useToastStore.getState().success(t('exercise.form.created'))
    await navigate('/exercises')
  }

  return (
    <ExerciseForm
      values={values}
      onChange={setValues}
      onSubmit={() => void onSubmit()}
      submitLabel={t('exercise.save')}
    />
  )
}
