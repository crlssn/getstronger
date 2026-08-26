import type { ExerciseMetric, Set } from '@/proto/api/v1/shared_pb'
import type { CSSProperties } from 'react'

import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { TrophyIcon } from '@heroicons/react/24/solid'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/ui/cn'
import { AppButton } from '@/ui/components/AppButton'
import { AppOptionRow } from '@/ui/components/AppOptionRow'
import { distanceUnitLabel } from '@/utils/distanceUnits'
import {
  exerciseMetrics,
  formatDurationDisplay,
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
  metrics?: ExerciseMetric[]
  /** The session opens on its first exercise, so the card is never all rows. */
  defaultOpen?: boolean
}

/**
 * One exercise of a finished workout: a row that opens onto its sets.
 *
 * A six-exercise session printed six SET / WEIGHT / REPS tables and ran to
 * several screens of near-identical rows, so what the session was is now the
 * list of names, and the numbers are one tap away.
 */
export const CardWorkoutExercise = ({
  sets,
  exerciseId,
  name,
  metrics: exerciseMetricList,
  defaultOpen = false,
}: Props) => {
  const { t } = useTranslation()

  const panelId = useId()
  const [open, setOpen] = useState(defaultOpen)

  const metrics = exerciseMetrics({ metrics: exerciseMetricList ?? [] })
  const measurements = measurementDefinitions.filter(({ metric }) => metrics.includes(metric))
  const showPace = isDistanceTimeExercise({ metrics })
  const hasPersonalBest = sets.some((set) => set.metadata?.personalBest)

  const columnLabel = (metric: ExerciseMetric) => {
    const definition = measurementDefinitions.find((measurement) => measurement.metric === metric)
    return definition ? t(definition.labelKey) : undefined
  }

  return (
    <article className={styles.exercise}>
      <AppOptionRow
        className={styles.summary}
        aria-expanded={open}
        aria-controls={panelId}
        trailing={
          <ChevronDownIcon
            className={cn(styles.caret, open && styles.caretOpen)}
            aria-hidden="true"
          />
        }
        onClick={() => setOpen((shown) => !shown)}
      >
        <span className={styles.summaryCopy}>
          <span className={styles.name}>{name}</span>
          {/* The marker is on the row rather than only inside it: what a reader
              scans this list for is which exercises went well. */}
          {hasPersonalBest && (
            <span className={styles.personalBestBadge}>
              <TrophyIcon aria-hidden="true" />
              {t('workout.personalBest')}
            </span>
          )}
          <span className={styles.setCount}>
            {t('workout.setsCompact', { count: sets.length })}
          </span>
        </span>
      </AppOptionRow>

      {open && (
        <div id={panelId} className={styles.panel}>
          <div
            className={styles.setTable}
            role="table"
            aria-label={t('workout.setsTableAria', { name })}
            style={{ '--metric-count': measurements.length + (showPace ? 1 : 0) } as CSSProperties}
          >
            <div className={cn(styles.setRow, styles.tableHead)} role="row">
              <span role="columnheader">{t('common.set')}</span>
              {measurements.map((measurement) => (
                <span key={measurement.field} role="columnheader">
                  {columnLabel(measurement.metric)}
                </span>
              ))}
              {showPace && <span role="columnheader">{t('common.pace')}</span>}
            </div>

            {sets.map((set, index) => {
              const personalBest = Boolean(set.metadata?.personalBest)

              return (
                <div
                  key={set.id || index}
                  className={cn(styles.setRow, personalBest && styles.personalBestRow)}
                  role="row"
                >
                  {/* The number stays on a record set: it was the one row where
                      a reader could not tell which set they were looking at. */}
                  <span
                    className={cn(styles.setNumber, personalBest && styles.personalBest)}
                    role="cell"
                    aria-label={
                      personalBest
                        ? t('workout.setPersonalBestAria', { number: index + 1 })
                        : t('workout.setNumberAria', { number: index + 1 })
                    }
                  >
                    {index + 1}
                  </span>

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

                  {/* A tint is not a label: the trophy is what says record to a
                      reader who cannot tell this row's colour from the next. */}
                  {personalBest && (
                    <span
                      className={styles.personalBestMark}
                      role="cell"
                      aria-label={t('workout.personalBest')}
                    >
                      <TrophyIcon aria-hidden="true" />
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <AppButton
            type="link"
            colour="ghost"
            size="inline"
            width="auto"
            className={styles.viewExercise}
            to={`/exercises/${exerciseId}`}
          >
            {t('workout.viewExercise')}
          </AppButton>
        </div>
      )}
    </article>
  )
}
