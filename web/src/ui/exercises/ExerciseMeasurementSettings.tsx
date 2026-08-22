import { useTranslation } from 'react-i18next'

import { ExerciseMetric } from '@/proto/api/v1/shared_pb'
import { usePreferencesStore } from '@/stores/preferences'
import { cn } from '@/ui/cn'
import { AppSegmented } from '@/ui/components/AppSegmented'
import { distanceUnitLabel } from '@/utils/distanceUnits'
import { weightUnitLabel } from '@/utils/weightUnits'
import styles from './ExerciseMeasurementSettings.module.css'

/** The rest length a switched-on timer starts at. */
export const defaultRestSeconds = 90

// Every 30 seconds up to five minutes, so any common rest length is one tap.
const restPresets = Array.from({ length: 10 }, (_, index) => (index + 1) * 30)

const formatRest = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

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
  restSeconds: number
  onRestSecondsChange: (seconds: number) => void
}

/** What an exercise measures, and how long its rest runs for. */
export const ExerciseMeasurementSettings = ({
  metrics,
  onMetricsChange,
  restSeconds,
  onRestSecondsChange,
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

  const restEnabled = restSeconds > 0

  return (
    <section className={styles.settings}>
      <div>
        <h3>{t('exercise.measurements.heading')}</h3>
        <p>{t('exercise.measurements.help')}</p>
      </div>

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
          <button
            key={measurement.value}
            type="button"
            className={cn(
              styles.measurement,
              metrics.includes(measurement.value) && styles.selected,
            )}
            aria-pressed={metrics.includes(measurement.value)}
            onClick={() => toggleMetric(measurement.value)}
          >
            <span className={styles.check} aria-hidden="true">
              {metrics.includes(measurement.value) ? '✓' : '+'}
            </span>
            <span>
              <strong>{measurement.label}</strong>
              <small>{measurement.unit}</small>
            </span>
          </button>
        ))}
      </div>

      <div className={styles.restSetting}>
        <div>
          <strong>{t('exercise.restTimer')}</strong>
          <small>{t('exercise.measurements.restHelp')}</small>
        </div>
        <button
          type="button"
          role="switch"
          className={styles.switch}
          aria-checked={restEnabled}
          aria-label={t('exercise.restTimer')}
          onClick={() => onRestSecondsChange(restEnabled ? 0 : defaultRestSeconds)}
        >
          <span className={styles.knob} />
        </button>
      </div>

      {restEnabled && (
        <div className={styles.restOptions}>
          {restPresets.map((seconds) => (
            <button
              key={seconds}
              type="button"
              aria-pressed={restSeconds === seconds}
              className={cn(restSeconds === seconds && styles.selected)}
              onClick={() => onRestSecondsChange(seconds)}
            >
              {formatRest(seconds)}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
