import type { DistanceUnit, Exercise, Set as LoggedSet, WeightUnit } from '@/proto/api/v1/shared_pb'
import type { Set } from '@/types/workout'
import type { MeasurementField } from '@/utils/exerciseMeasurements'
import type { SessionStation } from '@/utils/workoutSession'
import type { CSSProperties } from 'react'

import { CheckIcon } from '@heroicons/react/24/outline'
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
import styles from './RoundTable.module.css'

/** One exercise's row in a round. */
export interface RoundRow {
  station: SessionStation
  /** This station's set in the round; absent until the round is laid out. */
  set?: Set
  /** The same round of the last session. */
  previous?: LoggedSet
}

interface Props {
  /** Which round the rows belong to, which is the set number they are logged as. */
  round: number
  rows: readonly RoundRow[]
  /** The station whose row carries the emphasis. */
  activeKey?: string
  weightUnit: WeightUnit
  distanceUnit: DistanceUnit
  onChange: (station: SessionStation, changes: Set) => void
  /** The session scrolls the field being typed into clear of its chrome. */
  onFocusField?: (
    station: SessionStation,
    field: MeasurementField,
    target: HTMLInputElement,
  ) => void
}

const noSet: Set = {}

/**
 * One round of a circuit: a row per exercise, walked top to bottom.
 *
 * The set table lays one exercise out set by set, which is the wrong way round
 * for a circuit — there the athlete takes one set of each exercise and then
 * goes round again, so the round is the unit of work and the exercises are the
 * rows inside it. Each row labels its own fields: two exercises in a circuit
 * need not measure the same things, so a shared header row has nothing to say.
 */
export const RoundTable = ({
  round,
  rows,
  activeKey,
  weightUnit,
  distanceUnit,
  onChange,
  onFocusField,
}: Props) => {
  const { t } = useTranslation()

  const fieldLabel = (exercise: Exercise, labelKey: string) =>
    t('workout.setFieldAria', {
      exercise: exercise.name,
      number: round,
      field: t(labelKey).toLocaleLowerCase(),
    })

  return (
    <div className={styles.rows}>
      {rows.map(({ station, set = noSet, previous }) => {
        const { key, exercise } = station
        const measurements = measurementsForExercise(exercise)
        const complete = isExerciseSetComplete(set, exercise)

        return (
          <div
            key={key}
            className={cn(
              styles.row,
              complete && styles.complete,
              key === activeKey && styles.active,
            )}
            style={{ '--metric-count': measurements.length } as CSSProperties}
          >
            <div className={styles.lead}>
              <strong className={styles.exerciseName}>
                {complete && <CheckIcon aria-hidden="true" />}
                <span>{exercise.name}</span>
              </strong>
              <span className={styles.previousValue}>
                {previous ? formatExerciseSet(previous, exercise) : '—'}
              </span>
            </div>

            {measurements.map((measurement) => {
              const label = fieldLabel(exercise, measurement.labelKey)
              const onFocus = (event: React.FocusEvent<HTMLInputElement>) =>
                onFocusField?.(station, measurement.field, event.currentTarget)

              return (
                <div key={measurement.metric} className={styles.field}>
                  <span className={styles.fieldLabel} aria-hidden="true">
                    {t(measurement.labelKey)}
                  </span>
                  {measurement.field === 'durationSeconds' ? (
                    <AppDurationInput
                      aria-label={label}
                      value={set.durationSeconds}
                      onChange={(durationSeconds) => onChange(station, { durationSeconds })}
                      onFocus={onFocus}
                    />
                  ) : (
                    <AppNumberField
                      aria-label={label}
                      inputMode={measurement.inputmode}
                      unit={
                        measurement.field === 'weight'
                          ? weightUnitLabel(weightUnit)
                          : measurement.field === 'distance'
                            ? distanceUnitLabel(distanceUnit)
                            : undefined
                      }
                      value={set[measurement.field]}
                      onChange={(entered) => onChange(station, { [measurement.field]: entered })}
                      onFocus={onFocus}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
