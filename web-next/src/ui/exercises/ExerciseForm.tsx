import type { ExerciseMetric } from '@/proto/api/v1/shared_pb'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { listExerciseTags } from '@/http/requests'
import { AppButton } from '@/ui/components/AppButton'
import { AppList } from '@/ui/components/AppList'
import { AppListItemInput } from '@/ui/components/AppListItemInput'
import { ExerciseMeasurementSettings } from '@/ui/exercises/ExerciseMeasurementSettings'
import { ExerciseTagsInput } from '@/ui/exercises/ExerciseTagsInput'
import styles from './ExerciseForm.module.css'

export interface ExerciseFormValues {
  name: string
  metrics: ExerciseMetric[]
  restSeconds: number
  tags: string[]
}

interface Props {
  values: ExerciseFormValues
  onChange: (values: ExerciseFormValues) => void
  onSubmit: () => void
  submitLabel: string
}

/**
 * The fields an exercise is made of, shared by creating one and editing one.
 *
 * It owns no exercise of its own — the screen above it decides what happens on
 * submit, and whether that is a create or an update.
 */
export const ExerciseForm = ({ values, onChange, onSubmit, submitLabel }: Props) => {
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
        restSeconds={values.restSeconds}
        onRestSecondsChange={(restSeconds) => update({ restSeconds })}
      />

      <h6>
        {t('exercise.form.tags')} <small>{t('common.optional')}</small>
      </h6>
      <ExerciseTagsInput
        value={values.tags}
        onChange={(tags) => update({ tags })}
        suggestions={suggestions}
      />

      <div className={styles.formActions}>
        <AppButton type="submit" colour="primary">
          {submitLabel}
        </AppButton>
      </div>
    </form>
  )
}
