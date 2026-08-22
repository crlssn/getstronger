import type { DistanceUnit, Exercise, Set as LoggedSet, WeightUnit } from '@/proto/api/v1/shared_pb'
import type { Set } from '@/types/workout'
import type { MeasurementField } from '@/utils/exerciseMeasurements'
import type { CSSProperties } from 'react'

import { CheckIcon, MinusIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import { cn } from '@/ui/cn'
import { AppDurationInput } from '@/ui/components/AppDurationInput'
import { AppNumberField } from '@/ui/components/AppNumberField'
import { distanceUnitLabel } from '@/utils/distanceUnits'
import {
  formatExerciseSet,
  isExerciseSetComplete,
  measurementsForExercise,
} from '@/utils/exerciseMeasurements'
import { weightUnitLabel } from '@/utils/weightUnits'
import styles from './WorkoutSetGrid.module.css'

interface Props {
  exercise: Exercise
  sets: readonly Set[]
  /** The same exercise's sets from the last session, shown alongside each row. */
  previousSets?: readonly LoggedSet[]
  /** The row being logged, which carries the emphasis. -1 once none is. */
  activeIndex: number
  weightUnit: WeightUnit
  distanceUnit: DistanceUnit
  onChange: (index: number, changes: Set) => void
  onFocusField: (index: number, field: MeasurementField, target: HTMLInputElement) => void
  onRemove: (index: number) => void
}

/**
 * One exercise's sets, as a row per set under a single row of column labels.
 *
 * The set number doubles as the completion mark, which is what lets a row hold
 * a set's whole story — what was done last time, what is being entered now, and
 * whether it counts — across a phone's width.
 */
export const WorkoutSetGrid = ({
  exercise,
  sets,
  previousSets,
  activeIndex,
  weightUnit,
  distanceUnit,
  onChange,
  onFocusField,
  onRemove,
}: Props) => {
  const { t } = useTranslation()

  const measurements = measurementsForExercise(exercise)
  const metricCount = { '--metric-count': measurements.length } as CSSProperties

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
          className={cn(styles.setGrid, styles.setLabels)}
          style={metricCount}
          aria-hidden="true"
        >
          <span>{t('common.set')}</span>
          <span>{t('common.previous')}</span>
          {measurements.map((measurement) => (
            <span key={measurement.metric}>{t(measurement.labelKey)}</span>
          ))}
        </div>
      )}

      {sets.map((set, index) => {
        const complete = isExerciseSetComplete(set, exercise)
        const previous = previousSets?.[index]

        return (
          <div
            key={index}
            className={cn(
              styles.setGrid,
              styles.setRow,
              complete && styles.complete,
              index === activeIndex && styles.active,
            )}
            style={metricCount}
          >
            <span className={styles.setNumber}>
              {complete ? <CheckIcon aria-hidden="true" /> : index + 1}
            </span>
            <span className={styles.previousValue}>
              {previous ? formatExerciseSet(previous, exercise) : '—'}
            </span>

            {measurements.map((measurement) => {
              const label = fieldLabel(index, measurement.labelKey)
              const onFocus = (event: React.FocusEvent<HTMLInputElement>) =>
                onFocusField(index, measurement.field, event.currentTarget)

              if (measurement.field === 'durationSeconds') {
                return (
                  <AppDurationInput
                    key={measurement.metric}
                    aria-label={label}
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
                  value={set[measurement.field]}
                  onChange={(entered) => onChange(index, { [measurement.field]: entered })}
                  onFocus={onFocus}
                />
              )
            })}

            {/* eslint-disable-next-line no-restricted-syntax -- A 24px badge
                overhanging the row's corner. At AppIconButton's 44px it would
                cover the right-hand edge of the field beside it and take taps
                meant for typing, so this one stays under the floor on purpose.
                Reaching it is a hover or a focus, which is a known gap on a
                phone and a redesign rather than a restyle. */}
            <button
              type="button"
              className={styles.removeSet}
              aria-label={t('workout.removeSet', { number: index + 1 })}
              onClick={() => onRemove(index)}
            >
              <MinusIcon aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </>
  )
}
