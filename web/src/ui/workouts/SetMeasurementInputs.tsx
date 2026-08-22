import type { Exercise, Set } from '@/proto/api/v1/shared_pb'
import type { CSSProperties } from 'react'

import { MinusCircleIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import { AppIconButton } from '@/ui/components/AppIconButton'
import { AppDurationInput } from '@/ui/components/AppDurationInput'
import { AppNumberField } from '@/ui/components/AppNumberField'
import { distanceUnitLabel } from '@/utils/distanceUnits'
import { hasAnyExerciseSetValue, measurementsForExercise } from '@/utils/exerciseMeasurements'
import { weightUnitLabel } from '@/utils/weightUnits'
import styles from './SetMeasurementInputs.module.css'

export type SetChanges = Partial<Pick<Set, 'weight' | 'reps' | 'distance' | 'durationSeconds'>>

interface Props {
  set: Partial<Set>
  exercise?: Pick<Exercise, 'metrics'>
  onChange: (changes: SetChanges) => void
  onRemove?: () => void
  removeLabel?: string
}

/**
 * One row of inputs for a single set, following what the exercise measures.
 *
 * A set is all-or-nothing: once any field has a value the rest are required,
 * so a half-filled set cannot be saved as if it were a real one.
 */
export const SetMeasurementInputs = ({ set, exercise, onChange, onRemove, removeLabel }: Props) => {
  const { t } = useTranslation()

  const measurements = measurementsForExercise(exercise)
  const required = hasAnyExerciseSetValue(set, exercise)

  return (
    <div
      className={styles.measurementRow}
      style={{ '--metric-count': measurements.length } as CSSProperties}
    >
      {measurements.map((measurement) => {
        const label = t(measurement.labelKey)
        const id = `set-${measurement.field}`

        return (
          <div key={measurement.field} className={styles.measurementInput}>
            <span>{label}</span>

            {measurement.field === 'durationSeconds' ? (
              <AppDurationInput
                id={id}
                aria-label={label}
                value={set.durationSeconds}
                required={required}
                onChange={(durationSeconds) => onChange({ durationSeconds })}
              />
            ) : (
              <AppNumberField
                id={id}
                aria-label={label}
                inputMode={measurement.inputmode}
                placeholder={label}
                required={required}
                unit={
                  measurement.field === 'weight'
                    ? weightUnitLabel(set.weightUnit)
                    : measurement.field === 'distance'
                      ? distanceUnitLabel(set.distanceUnit)
                      : undefined
                }
                value={set[measurement.field]}
                onChange={(entered) => onChange({ [measurement.field]: entered })}
              />
            )}
          </div>
        )
      })}

      {/* Both or neither: AppIconButton has no label but the one it is given,
          so a remove control without one would be an unnamed button. */}
      {onRemove && removeLabel && (
        <AppIconButton
          className={styles.removeSet}
          icon={MinusCircleIcon}
          // Quiet: the minus carries the meaning, and a column of red circles
          // beside every set reads as a page full of errors.
          label={removeLabel}
          onClick={onRemove}
        />
      )}
    </div>
  )
}
