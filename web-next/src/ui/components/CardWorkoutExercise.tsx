import type { ExerciseMetric, Set } from '@/proto/api/v1/shared_pb'
import type { CSSProperties } from 'react'

import { TrophyIcon } from '@heroicons/react/24/solid'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { cn } from '@/ui/cn'
import { ExerciseTags } from '@/ui/exercises/ExerciseTags'
import { distanceUnitLabel } from '@/utils/distanceUnits'
import {
  exerciseMetrics,
  formatDurationDisplay,
  formatExerciseSet,
  formatSetPace,
  isDistanceTimeExercise,
  measurementDefinitions,
} from '@/utils/exerciseMeasurements'
import { formatNumber } from '@/utils/numbers'
import { weightUnitLabel } from '@/utils/weightUnits'
import styles from './CardWorkoutExercise.module.css'

type Measurement = (typeof measurementDefinitions)[number]

const formatValue = (set: Set, field: Measurement['field']) =>
  field === 'durationSeconds' ? formatDurationDisplay(set[field]) : formatNumber(set[field], 2)

interface Props {
  sets: Set[]
  exerciseId?: string
  name?: string
  tags?: string[]
  metrics?: ExerciseMetric[]
  /** One line per set, for a feed card rather than a full workout. */
  compact?: boolean
  /** Drops the card frame, for a list that draws its own dividers. */
  flat?: boolean
}

/** One exercise's sets, as a table whose columns follow what it measures. */
export const CardWorkoutExercise = ({
  sets,
  exerciseId,
  name,
  tags = [],
  metrics: exerciseMetricList,
  compact = false,
  flat = false,
}: Props) => {
  const { t } = useTranslation()

  const metrics = exerciseMetrics({ metrics: exerciseMetricList ?? [] })
  const measurements = measurementDefinitions.filter(({ metric }) => metrics.includes(metric))
  const showPace = isDistanceTimeExercise({ metrics })

  const columnLabel = (metric: ExerciseMetric) => {
    const definition = measurementDefinitions.find((measurement) => measurement.metric === metric)
    return definition ? t(definition.labelKey) : undefined
  }

  const setNumberLabel = (index: number, personalBest: boolean) =>
    personalBest
      ? t('workout.setPersonalBestAria', { number: index + 1 })
      : t('workout.setNumberAria', { number: index + 1 })

  return (
    <article className={cn(styles.exerciseBlock, compact && styles.compact, flat && styles.flat)}>
      <header>
        <div>
          <Link to={`/exercises/${exerciseId}`}>{name}</Link>
          <ExerciseTags compact tags={tags} />
        </div>
        {!compact && (
          <span className={styles.setCount}>
            {t('workout.setsCompact', { count: sets.length })}
          </span>
        )}
      </header>

      <div
        className={styles.setTable}
        role="table"
        aria-label={t('workout.setsTableAria', { name })}
        style={{ '--metric-count': measurements.length + (showPace ? 1 : 0) } as CSSProperties}
      >
        {!compact && (
          <div className={cn(styles.setRow, styles.tableHead)} role="row">
            <span role="columnheader">{t('common.set')}</span>
            {measurements.map((measurement) => (
              <span key={measurement.field} role="columnheader">
                {columnLabel(measurement.metric)}
              </span>
            ))}
            {showPace && <span role="columnheader">{t('common.pace')}</span>}
          </div>
        )}

        {sets.map((set, index) => {
          const personalBest = Boolean(set.metadata?.personalBest)

          return (
            <div key={set.id || index} className={styles.setRow} role="row">
              <span
                className={cn(styles.setNumber, !compact && personalBest && styles.personalBest)}
                role="cell"
                aria-label={setNumberLabel(index, personalBest)}
              >
                {/* A trophy replaces the number on a best, but only where there
                    is room for it: the compact row keeps its own badge. */}
                {!compact && personalBest ? <TrophyIcon aria-hidden="true" /> : index + 1}
              </span>

              {compact ? (
                <span className={styles.compactSetValue} role="cell">
                  <strong>{formatExerciseSet(set, { metrics })}</strong>
                  {personalBest && (
                    <span
                      className={styles.compactPersonalBest}
                      role="img"
                      aria-label={t('workout.personalBest')}
                    >
                      <TrophyIcon aria-hidden="true" />
                    </span>
                  )}
                </span>
              ) : (
                <>
                  {measurements.map((measurement) => (
                    <span key={measurement.field} role="cell">
                      <strong>{formatValue(set, measurement.field)}</strong>
                      {measurement.field === 'weight' && (
                        <small>{weightUnitLabel(set.weightUnit)}</small>
                      )}
                      {measurement.field === 'distance' && (
                        <small>{distanceUnitLabel(set.distanceUnit)}</small>
                      )}
                    </span>
                  ))}
                  {showPace && (
                    <span className={styles.setPace} role="cell">
                      {formatSetPace(set) ?? '—'}
                    </span>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </article>
  )
}
