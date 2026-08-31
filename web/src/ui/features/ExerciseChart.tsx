import type { Exercise, Set } from '@/proto/api/v1/shared_pb'
import type { TrendMetric } from '@/utils/exerciseTrend'
import type { ChartOptions } from 'chart.js'

import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import { useTranslation } from 'react-i18next'

import { ExerciseMetric } from '@/proto/api/v1/shared_pb'
import { selectTheme, useLocaleStore } from '@/stores/locale'
import { borderColor, chartFillColor, inkColor, subtleColor, surfaceColor } from '@/ui/chartTokens'
import { AppSegmented } from '@/ui/components/AppSegmented'
import {
  exerciseMetrics,
  formatDistanceDisplay,
  formatDurationDisplay,
  formatPaceDisplay,
  isDistanceTimeExercise,
} from '@/utils/exerciseMeasurements'
import { trendByDay, trendBySet, trendChange } from '@/utils/exerciseTrend'
import { formatNumber } from '@/utils/numbers'
import { usePrefersReducedMotion } from '@/utils/usePrefersReducedMotion'
import styles from './ExerciseChart.module.css'

ChartJS.register(Tooltip, LineElement, CategoryScale, LinearScale, Filler, PointElement)

interface Props {
  sets: Set[]
  exercise: Pick<Exercise, 'metrics'>
}

/** How one exercise has moved over time, on whichever measure is asked for. */
export const ExerciseChart = ({ sets, exercise }: Props) => {
  const { t } = useTranslation()

  const selected = exerciseMetrics(exercise)
  const hasWeightAndReps =
    selected.includes(ExerciseMetric.WEIGHT) && selected.includes(ExerciseMetric.REPS)

  // Ordered as they are read: the headline measure first, the summed one last.
  // Labels stay short enough that every one is visible at 390px — the working
  // weight is named by its unit, the summed volume by its clipped word.
  const options: { key: TrendMetric; label: string }[] = [
    ...(hasWeightAndReps ? [{ key: 'oneRm' as const, label: t('exercise.chart.oneRmShort') }] : []),
    ...(selected.includes(ExerciseMetric.WEIGHT)
      ? [{ key: 'weight' as const, label: t('common.kg') }]
      : []),
    ...(selected.includes(ExerciseMetric.REPS)
      ? [{ key: 'reps' as const, label: t('common.reps') }]
      : []),
    ...(selected.includes(ExerciseMetric.DISTANCE)
      ? [{ key: 'distance' as const, label: t('common.distance') }]
      : []),
    ...(selected.includes(ExerciseMetric.TIME)
      ? [{ key: 'durationSeconds' as const, label: t('common.time') }]
      : []),
    // Pace only has one unambiguous speed per set on the exact distance × time
    // pair, mirroring the pace column on logged sets.
    ...(isDistanceTimeExercise(exercise)
      ? [{ key: 'pace' as const, label: t('common.pace') }]
      : []),
    ...(hasWeightAndReps
      ? [{ key: 'volume' as const, label: t('exercise.chart.volumeShort') }]
      : []),
  ]

  const [metric, setMetric] = useState<TrendMetric>(options[0]?.key ?? 'weight')

  const details: Record<TrendMetric, { heading: string; unit: string }> = {
    oneRm: { heading: t('exercise.estimated1rm'), unit: t('common.kg') },
    weight: { heading: t('exercise.chart.workingWeight'), unit: t('common.kg') },
    volume: { heading: t('exercise.chart.dailyVolume'), unit: t('common.kg') },
    reps: { heading: t('exercise.chart.mostReps'), unit: t('common.reps').toLocaleLowerCase() },
    distance: { heading: t('common.distance'), unit: '' },
    durationSeconds: { heading: t('common.time'), unit: '' },
    pace: { heading: t('common.pace'), unit: '' },
  }

  const stillness = usePrefersReducedMotion()
  // Subscribed for the re-render alone: the token reads below answer in
  // whichever palette is on the root element by then.
  useLocaleStore(selectTheme)
  const days = useMemo(() => trendByDay(sets), [sets])
  const points = useMemo(() => trendBySet(sets), [sets])
  // A run is its own result, so the cardio measures plot every set; the
  // strength ones keep answering "how strong was I that day" with its best.
  const perSet = metric === 'distance' || metric === 'durationSeconds' || metric === 'pace'
  // A set that never recorded the plotted measure would drag the line to
  // zero, so only the sets that did are plotted.
  const series = perSet ? points.filter((point) => point[metric] > 0) : days
  const values = series.map((point) => point[metric])
  const latest = values[values.length - 1] ?? 0

  const formatValue = (value: number) => {
    switch (metric) {
      case 'durationSeconds':
        return formatDurationDisplay(value)
      case 'distance':
        return formatDistanceDisplay(value)
      case 'pace':
        return formatPaceDisplay(value)
      default:
        return `${formatNumber(value)} ${details[metric].unit}`
    }
  }

  const formattedLatest = formatValue(latest)

  const percentage = trendChange(values)
  const change =
    percentage === undefined
      ? ''
      : percentage === 0
        ? t('exercise.chart.noChange')
        : `${percentage > 0 ? '+' : ''}${percentage}%`

  const chartOptions: ChartOptions<'line'> = {
    // A canvas animation is still an animation, and no media query reaches one.
    animation: stillness ? false : undefined,
    maintainAspectRatio: false,
    responsive: true,
    scales: {
      // The headline above the plot carries the latest value and its unit, so
      // the y axis says nothing: one baseline hairline is all the scaffolding.
      x: {
        // Several sets can share a day, and a day printed twice reads as a
        // mistake: only a label's first point keeps its tick.
        afterBuildTicks: (axis) => {
          const seen = new Set<string>()
          axis.ticks = axis.ticks.filter((tick) => {
            const label = axis.getLabelForValue(tick.value)
            if (seen.has(label)) return false
            seen.add(label)
            return true
          })
        },
        border: { color: borderColor() },
        grid: { display: false },
        ticks: { color: subtleColor(), maxRotation: 0, maxTicksLimit: 6 },
      },
      y: {
        beginAtZero: false,
        border: { display: false },
        grid: { display: false },
        ticks: { display: false },
        title: { display: false },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          // With no y axis to read against, the tooltip formats the value the
          // same way as the headline.
          label: (item) => `${details[metric].heading}: ${formatValue(item.parsed.y ?? 0)}`,
        },
      },
    },
  }

  return (
    <div className={styles.exerciseChart}>
      <header>
        <div>
          <small>{details[metric].heading}</small>
          <strong>{formattedLatest}</strong>
        </div>
        {change && <span>{change}</span>}
      </header>

      <AppSegmented
        label={t('exercise.chart.metricAria')}
        options={options.map((option) => ({ label: option.label, value: option.key }))}
        value={metric}
        onChange={setMetric}
      />

      {/* One point is not a trend, so it says what it is waiting for instead of
          drawing a line through a single dot. */}
      {series.length > 1 ? (
        <div className={styles.chartFrame}>
          <Line
            data={{
              labels: series.map((point) => point.label),
              datasets: [
                {
                  backgroundColor: chartFillColor(),
                  borderColor: inkColor(),
                  borderWidth: 2,
                  data: values,
                  fill: true,
                  label: details[metric].heading,
                  pointBackgroundColor: surfaceColor(),
                  pointBorderColor: inkColor(),
                  pointBorderWidth: 2,
                  // A dot on every point turns the line into beads; only the
                  // latest one is marked. The hit radius keeps every point's
                  // tooltip reachable.
                  pointRadius: (context) => (context.dataIndex === values.length - 1 ? 4 : 0),
                  pointHitRadius: 12,
                  tension: 0.35,
                },
              ],
            }}
            options={chartOptions}
            aria-label={details[metric].heading}
            role="img"
          />
        </div>
      ) : (
        <div className={styles.firstResult} role="status">
          <span aria-hidden="true" />
          <strong>
            {series.length ? t('exercise.chart.firstResult') : t('exercise.chart.noResults')}
          </strong>
          <p>
            {series.length
              ? t('exercise.chart.firstResultBody')
              : t('exercise.chart.noResultsBody')}
          </p>
        </div>
      )}
    </div>
  )
}
