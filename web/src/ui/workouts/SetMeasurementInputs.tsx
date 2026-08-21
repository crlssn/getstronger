import type { Exercise, Set } from '@/proto/api/v1/shared_pb'
import type { CSSProperties } from 'react'

import { MinusCircleIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import { DurationInput } from '@/ui/workouts/DurationInput'
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

const asNumber = (value: string) => (value === '' ? undefined : Number(value))

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
              <DurationInput
                aria-label={label}
                value={set.durationSeconds}
                required={required}
                onChange={(durationSeconds) => onChange({ durationSeconds })}
              />
            ) : measurement.field === 'weight' || measurement.field === 'distance' ? (
              <div className={styles.withUnit}>
                <input
                  id={id}
                  aria-label={label}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder={label}
                  required={required}
                  value={set[measurement.field] ?? ''}
                  onChange={(event) =>
                    onChange({ [measurement.field]: asNumber(event.target.value) })
                  }
                />
                <span className={styles.unitSuffix}>
                  {measurement.field === 'weight'
                    ? weightUnitLabel(set.weightUnit)
                    : distanceUnitLabel(set.distanceUnit)}
                </span>
              </div>
            ) : (
              <input
                id={id}
                aria-label={label}
                type="number"
                inputMode={measurement.inputmode}
                min="0"
                step={measurement.field === 'reps' ? 1 : 'any'}
                placeholder={label}
                required={required}
                value={set[measurement.field] ?? ''}
                onChange={(event) =>
                  onChange({ [measurement.field]: asNumber(event.target.value) })
                }
              />
            )}
          </div>
        )
      })}

      {onRemove && (
        <button
          type="button"
          className={styles.removeSet}
          aria-label={removeLabel}
          onClick={onRemove}
        >
          <MinusCircleIcon aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
