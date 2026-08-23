import { useTranslation } from 'react-i18next'

import { ExerciseMetric } from '@/proto/api/v1/shared_pb'
import { usePreferencesStore } from '@/stores/preferences'
import { AppOptionRow } from '@/ui/components/AppOptionRow'
import { AppSegmented } from '@/ui/components/AppSegmented'
import { distanceUnitLabel } from '@/utils/distanceUnits'
import { weightUnitLabel } from '@/utils/weightUnits'
import styles from './ExerciseMeasurementSettings.module.css'

const presets = [
  {
    labelKey: 'exercise.measurements.presetWeightReps',
    values: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
  },
  {
    labelKey: 'exercise.measurements.presetDistanceTime',
    values: [ExerciseMetric.DISTANCE, ExerciseMetric.TIME],
  },
  { labelKey: 'exercise.measurements.presetRepsOnly', values: [ExerciseMetric.REPS] },
  { labelKey: 'exercise.measurements.presetTimed', values: [ExerciseMetric.TIME] },
]

interface Props {
  metrics: ExerciseMetric[]
  onMetricsChange: (metrics: ExerciseMetric[]) => void
  /**
   * Whether the measurements are settled by sets already logged. A logged set
   * is stored in the columns its exercise measured by at the time, so the
   * measurements are read back rather than offered for editing.
   */
  metricsLocked?: boolean
}

/**
 * What an exercise measures.
 *
 * How long it rests between sets is not asked here: rest belongs to the routine
 * that trains the exercise, which can want one length in a strength block and
 * another in a circuit.
 */
export const ExerciseMeasurementSettings = ({
  metrics,
  onMetricsChange,
  metricsLocked = false,
}: Props) => {
  const { t } = useTranslation()
  const weightUnit = usePreferencesStore((state) => state.weightUnit)
  const distanceUnit = usePreferencesStore((state) => state.distanceUnit)

  // The unit hints reflect the signed-in user's preferences so the card shows
  // what a set of this exercise will actually be logged in.
  const measurements = [
    { value: ExerciseMetric.WEIGHT, label: t('common.weight'), unit: weightUnitLabel(weightUnit) },
    {
      value: ExerciseMetric.REPS,
      label: t('common.reps'),
      unit: t('exercise.measurements.unitCount'),
    },
    {
      value: ExerciseMetric.DISTANCE,
      label: t('common.distance'),
      unit: distanceUnitLabel(distanceUnit),
    },
    {
      value: ExerciseMetric.TIME,
      label: t('common.time'),
      unit: t('exercise.measurements.unitMinSec'),
    },
  ]

  const isPreset = (values: ExerciseMetric[]) =>
    values.length === metrics.length && values.every((value) => metrics.includes(value))

  // An exercise that measures nothing cannot log a set, so the last one stays.
  const toggleMetric = (metric: ExerciseMetric) => {
    if (!metrics.includes(metric)) {
      onMetricsChange([...metrics, metric])
      return
    }
    if (metrics.length === 1) return
    onMetricsChange(metrics.filter((value) => value !== metric))
  }

  return (
    <section className={styles.settings}>
      <div>
        <h3>{t('exercise.measurements.heading')}</h3>
        <p>
          {metricsLocked ? t('exercise.measurements.lockedHelp') : t('exercise.measurements.help')}
        </p>
      </div>

      {metricsLocked ? (
        // Only what the exercise measures, and no way to change it: the other
        // three would be controls whose every tap the backend refuses.
        <ul className={styles.measurementGrid} aria-label={t('exercise.measurements.heading')}>
          {measurements
            .filter((measurement) => metrics.includes(measurement.value))
            .map((measurement) => (
              <li key={measurement.value} className={styles.lockedMeasurement}>
                <strong>{measurement.label}</strong>
                <small>{measurement.unit}</small>
              </li>
            ))}
        </ul>
      ) : (
        <>
          <AppSegmented
            label={t('exercise.measurements.presetsAria')}
            options={presets.map((preset) => ({ label: t(preset.labelKey), value: preset }))}
            value={presets.find((preset) => isPreset(preset.values))}
            onChange={(preset) => preset && onMetricsChange([...preset.values])}
          />

          <div
            className={styles.measurementGrid}
            role="group"
            aria-label={t('exercise.measurements.heading')}
          >
            {measurements.map((measurement) => (
              <AppOptionRow
                key={measurement.value}
                className={styles.measurement}
                leading={
                  <span className={styles.check} aria-hidden="true">
                    {metrics.includes(measurement.value) ? '✓' : '+'}
                  </span>
                }
                selected={metrics.includes(measurement.value)}
                onClick={() => toggleMetric(measurement.value)}
              >
                <strong>{measurement.label}</strong>
                <small>{measurement.unit}</small>
              </AppOptionRow>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
