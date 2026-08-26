import type { ExerciseMetric } from '@/proto/api/v1/shared_pb'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { listExerciseTags } from '@/http/requests'
import { AppButton } from '@/ui/components/AppButton'
import { AppFormFooter } from '@/ui/components/AppFormFooter'
import { AppList } from '@/ui/components/AppList'
import { AppListItemInput } from '@/ui/components/AppListItemInput'
import { ExerciseMeasurementSettings } from '@/ui/exercises/ExerciseMeasurementSettings'
import { ExerciseTagsInput } from '@/ui/exercises/ExerciseTagsInput'

export interface ExerciseFormValues {
  name: string
  metrics: ExerciseMetric[]
  tags: string[]
}

interface Props {
  values: ExerciseFormValues
  onChange: (values: ExerciseFormValues) => void
  onSubmit: () => void
  submitLabel: string
  /** Whether what the exercise measures is settled by sets already logged. */
  metricsLocked?: boolean
}

/**
 * The fields an exercise is made of, shared by creating one and editing one.
 *
 * It owns no exercise of its own — the screen above it decides what happens on
 * submit, and whether that is a create or an update.
 */
export const ExerciseForm = ({
  values,
  onChange,
  onSubmit,
  submitLabel,
  metricsLocked = false,
}: Props) => {
  const { t } = useTranslation()
  const [suggestions, setSuggestions] = useState<string[]>([])

  useEffect(() => {
    const load = async () => setSuggestions(await listExerciseTags())
    void load()
  }, [])

  const update = (changes: Partial<ExerciseFormValues>) => onChange({ ...values, ...changes })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <h6>{t('exercise.name')}</h6>
      <AppList>
        <AppListItemInput
          label={t('exercise.name')}
          model={values.name}
          type="text"
          required
          onUpdate={(name) => update({ name })}
        />
      </AppList>

      <h6>{t('exercise.form.tracking')}</h6>
      <ExerciseMeasurementSettings
        metrics={values.metrics}
        onMetricsChange={(metrics) => update({ metrics })}
        metricsLocked={metricsLocked}
      />

      <h6>
        {t('exercise.form.tags')} <small>{t('common.optional')}</small>
      </h6>
      <ExerciseTagsInput
        value={values.tags}
        onChange={(tags) => update({ tags })}
        suggestions={suggestions}
      />

      {/* Pinned rather than parked at the end of the scroll, where the tab
          bar sliced it in half. */}
      <AppFormFooter>
        <AppButton type="submit" colour="primary" size="lg">
          {submitLabel}
        </AppButton>
      </AppFormFooter>
    </form>
  )
}
