import type { CreateExerciseRequest } from '@/proto/api/v1/exercise_service_pb'
import type { ExerciseFormValues } from '@/ui/exercises/ExerciseForm'

import { create } from '@bufbuild/protobuf'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { consumeRequestError, consumeRequestOffline, createExercise } from '@/http/requests'
import posthog from '@/posthog'
import { CreateExerciseRequestSchema, ExerciseService } from '@/proto/api/v1/exercise_service_pb'
import { ExerciseMetric } from '@/proto/api/v1/shared_pb'
import { useMutationQueueStore } from '@/stores/mutationQueue'
import { useToastStore } from '@/stores/toasts'
import { ExerciseForm } from '@/ui/exercises/ExerciseForm'
import { randomUUID } from '@/utils/randomUUID'

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
  const [error, setError] = useState<string>()

  // Filing a movement must not depend on the network: the create is queued for
  // delivery on reconnect under the id the library already shows it under.
  const createExerciseOffline = async (request: CreateExerciseRequest) => {
    useMutationQueueStore.getState().enqueue(ExerciseService.method.createExercise, request)
    posthog.capture('exercise_created', { offline: true })
    useToastStore.getState().success(t('exercise.form.createdOffline'))
    await navigate('/exercises')
  }

  const onSubmit = async () => {
    setError(undefined)
    // The id is minted here rather than by the server, so a routine or a
    // workout can reference the exercise before the create has been sent.
    const request = create(CreateExerciseRequestSchema, { ...values, id: randomUUID() })
    const res = await createExercise(request)
    if (!res) {
      const message = consumeRequestError()
      if (consumeRequestOffline()) {
        await createExerciseOffline(request)
        return
      }

      setError(message ?? t('common.somethingWentWrong'))
      return
    }

    posthog.capture('exercise_created')
    useToastStore.getState().success(t('exercise.form.created'))
    await navigate('/exercises')
  }

  return (
    <ExerciseForm
      values={values}
      onChange={setValues}
      onSubmit={() => void onSubmit()}
      submitLabel={t('exercise.create')}
      offerLibrary
      error={error}
    />
  )
}
