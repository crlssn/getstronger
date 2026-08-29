import type { ExerciseMetric } from '@/proto/api/v1/shared_pb'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { listExerciseTags } from '@/http/requests'
import { AppButton } from '@/ui/components/AppButton'
import { AppFormFooter } from '@/ui/components/AppFormFooter'
import { AppInput } from '@/ui/components/AppInput'
import { AppOptionalAction } from '@/ui/components/AppOptionalAction'
import { ExerciseMeasurementSettings } from '@/ui/exercises/ExerciseMeasurementSettings'
import { ExerciseTagsInput } from '@/ui/exercises/ExerciseTagsInput'
import styles from './ExerciseForm.module.css'

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
  /** Why the last save failed, rendered inline beside the submit. */
  error?: string
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
  error,
}: Props) => {
  const { t } = useTranslation()
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [tagsOpen, setTagsOpen] = useState(values.tags.length > 0)

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
      {/* The screen's first-class field: overline label on the canvas, the
          standard input under it, no panel of its own. */}
      <AppInput
        className={styles.name}
        variant="hero"
        label={t('exercise.name')}
        value={values.name}
        type="text"
        required
        onChange={(event) => update({ name: event.target.value })}
      />

      <ExerciseMeasurementSettings
        metrics={values.metrics}
        onMetricsChange={(metrics) => update({ metrics })}
        metricsLocked={metricsLocked}
      />

      {/* Collapsed until wanted: most exercises ship without tags, and an open
          input suggests the form is waiting for one. An exercise that already
          has tags opens with them showing. */}
      {tagsOpen ? (
        <>
          <h2 className={styles.sectionTitle}>{t('exercise.form.tags')}</h2>
          <ExerciseTagsInput
            value={values.tags}
            onChange={(tags) => update({ tags })}
            suggestions={suggestions}
          />
        </>
      ) : (
        <AppOptionalAction label={t('exercise.form.addTags')} onClick={() => setTagsOpen(true)} />
      )}

      {/* Pinned rather than parked at the end of the scroll, where the tab
          bar sliced it in half. */}
      <AppFormFooter error={error}>
        <AppButton type="submit" colour="primary" size="lg">
          {submitLabel}
        </AppButton>
      </AppFormFooter>
    </form>
  )
}
