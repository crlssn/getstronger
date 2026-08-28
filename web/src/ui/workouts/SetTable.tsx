import type { DistanceUnit, Exercise, Set as LoggedSet, WeightUnit } from '@/proto/api/v1/shared_pb'
import type { Set } from '@/types/workout'
import type { MeasurementField } from '@/utils/exerciseMeasurements'
import type { CSSProperties } from 'react'

import { CheckIcon, MinusIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import { cn } from '@/ui/cn'
import { AppDurationInput } from '@/ui/components/AppDurationInput'
import { AppIconButton } from '@/ui/components/AppIconButton'
import { AppNumberField } from '@/ui/components/AppNumberField'
import { distanceUnitLabel } from '@/utils/distanceUnits'
import {
  formatExerciseSet,
  hasAnyExerciseSetValue,
  isExerciseSetComplete,
  measurementsForExercise,
} from '@/utils/exerciseMeasurements'
import { weightUnitLabel } from '@/utils/weightUnits'
import styles from './SetTable.module.css'

/**
 * What the table is for.
 *
 * `log` is the session being trained: the previous session's numbers sit
 * beside the fields being typed into, and the row being logged is marked.
 * `edit` is the same session being corrected afterwards, where there is no
 * "previous" to show and no row in progress, so that column carries the way to
 * take a set out instead.
 */
export type SetTableMode = 'log' | 'edit'

interface Props {
  exercise: Exercise
  sets: readonly Set[]
  mode: SetTableMode
  /** `log` only: the same exercise's sets from the last session. */
  previousSets?: readonly LoggedSet[]
  /** `log` only: the row being logged, which carries the emphasis. -1 once none is. */
  activeIndex?: number
  weightUnit: WeightUnit
  distanceUnit: DistanceUnit
  onChange: (index: number, changes: Set) => void
  /** `log` only: the session scrolls the field being typed into clear of its chrome. */
  onFocusField?: (index: number, field: MeasurementField, target: HTMLInputElement) => void
  onRemove: (index: number) => void
}

/**
 * One exercise's sets, as a row per set under a single row of column labels.
 *
 * The set number doubles as the completion mark, which is what lets a row hold
 * a set's whole story — what was done last time, what is being entered now, and
 * whether it counts — across a phone's width.
 *
 * Correcting a workout used to be a different object entirely: a stacked block
 * per set, "SET 1" as a heading over "Weight" and "Reps" labels above each
 * field, roughly three times the height and with no reference to what came
 * before. Logging a set is the app's most-used interaction, so it is the same
 * table in both places and the same muscle memory.
 */
export const SetTable = ({
  exercise,
  sets,
  mode,
  previousSets,
  activeIndex = -1,
  weightUnit,
  distanceUnit,
  onChange,
  onFocusField,
  onRemove,
}: Props) => {
  const { t } = useTranslation()

  const measurements = measurementsForExercise(exercise)
  const metricCount = { '--metric-count': measurements.length } as CSSProperties
  const logging = mode === 'log'

  const fieldLabel = (index: number, labelKey: string) =>
    t('workout.setFieldAria', {
      exercise: exercise.name,
      number: index + 1,
      field: t(labelKey).toLocaleLowerCase(),
    })

  return (
    <>
      {sets.length > 0 && (
        <div
          className={cn(styles.setGrid, styles.setLabels, !logging && styles.editing)}
          style={metricCount}
          aria-hidden="true"
        >
          <span>{t('common.set')}</span>
          {/* Nothing came before a set being corrected, so the column that
              would have said so carries the way to take it out. */}
          <span>{logging ? t('common.previous') : ''}</span>
          {measurements.map((measurement) => (
            <span key={measurement.metric}>{t(measurement.labelKey)}</span>
          ))}
        </div>
      )}

      {sets.map((set, index) => {
        const complete = isExerciseSetComplete(set, exercise)
        const previous = previousSets?.[index]
        const removeLabel = t('workout.removeSet', { number: index + 1 })
        // A set is all-or-nothing: once any field has a value the rest are
        // required, so a half-filled one cannot be saved as if it were real.
        const required = !logging && hasAnyExerciseSetValue(set, exercise)

        return (
          <div
            key={index}
            className={cn(
              styles.setGrid,
              styles.setRow,
              !logging && styles.editing,
              complete && styles.complete,
              index === activeIndex && styles.active,
            )}
            style={metricCount}
          >
            <span className={styles.setNumber}>
              {complete ? <CheckIcon aria-hidden="true" /> : index + 1}
            </span>

            {logging ? (
              <span className={styles.previousValue}>
                {previous ? formatExerciseSet(previous, exercise) : '—'}
              </span>
            ) : (
              <AppIconButton
                className={styles.removeCell}
                icon={MinusIcon}
                label={removeLabel}
                onClick={() => onRemove(index)}
              />
            )}

            {measurements.map((measurement) => {
              const label = fieldLabel(index, measurement.labelKey)
              const onFocus = (event: React.FocusEvent<HTMLInputElement>) =>
                onFocusField?.(index, measurement.field, event.currentTarget)

              if (measurement.field === 'durationSeconds') {
                return (
                  <AppDurationInput
                    key={measurement.metric}
                    aria-label={label}
                    required={required}
                    value={set.durationSeconds}
                    onChange={(durationSeconds) => onChange(index, { durationSeconds })}
                    onFocus={onFocus}
                  />
                )
              }

              if (measurement.field === 'weight' || measurement.field === 'distance') {
                const field = measurement.field

                return (
                  <AppNumberField
                    key={measurement.metric}
                    aria-label={label}
                    inputMode="decimal"
                    required={required}
                    unit={
                      field === 'weight'
                        ? weightUnitLabel(weightUnit)
                        : distanceUnitLabel(distanceUnit)
                    }
                    value={set[field]}
                    onChange={(entered) => onChange(index, { [field]: entered })}
                    onFocus={onFocus}
                  />
                )
              }

              return (
                <AppNumberField
                  key={measurement.metric}
                  aria-label={label}
                  inputMode={measurement.inputmode}
                  required={required}
                  value={set[measurement.field]}
                  onChange={(entered) => onChange(index, { [measurement.field]: entered })}
                  onFocus={onFocus}
                />
              )
            })}

            {logging && (
              /* eslint-disable-next-line no-restricted-syntax -- A 44px target
                 that shows as a 24px disc in the row's corner. AppIconButton
                 fills its whole square on hover, which here would put a fill
                 over the field the disc sits on. */
              <button
                type="button"
                className={styles.removeSet}
                aria-label={removeLabel}
                // The row's own focus is what reveals this on a phone, so the
                // press must not take it away: blurring the field first would
                // hide the button out from under the finger already on it.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onRemove(index)}
              >
                <MinusIcon aria-hidden="true" />
              </button>
            )}
          </div>
        )
      })}
    </>
  )
}
