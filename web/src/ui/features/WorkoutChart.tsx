import type { Workout } from '@/proto/api/v1/workout_service_pb'
import type { ChartOptions } from 'chart.js'

import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from 'chart.js'
import { useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import { useTranslation } from 'react-i18next'

import { borderColor, inkColor, subtleColor, successColor } from '@/ui/chartTokens'
import { latestValueLabel } from '@/ui/features/latestValueLabel'
import { volumeSeries } from '@/utils/dailyVolume'
import { formatNumber } from '@/utils/numbers'
import styles from './WorkoutChart.module.css'

ChartJS.register(Tooltip, BarElement, CategoryScale, LinearScale)

/** Below this a bar chart is drawing a statistic, not a trend. */
const minimumTrendPoints = 3

interface Props {
  workouts: Workout[]
}

/**
 * Training volume as bars, at whichever grain still reads.
 *
 * Two things it refuses to draw. A year of daily bars is 52 slivers about 4px
 * wide in a phone-width card, so past a handful of days the series aggregates
 * to weeks. And one bar filling the whole card is a figure pretending to be a
 * trend, so under three points it is read out instead.
 */
export const WorkoutChart = ({ workouts }: Props) => {
  const { t } = useTranslation()

  const { granularity, points } = useMemo(() => volumeSeries(workouts), [workouts])

  if (points.length === 0) return null

  if (points.length < minimumTrendPoints) {
    const latest = points[points.length - 1]

    return (
      <div className={styles.figure}>
        <strong>
          {formatNumber(latest?.volume ?? 0)} {t('common.kg')}
          <span aria-hidden="true"> · </span>
          <span className={styles.figureDate}>{latest?.label}</span>
        </strong>
        <small>
          {points.length === 1 ? t('progress.volumeSinglePoint') : t('progress.volumeFewPoints')}
        </small>
      </div>
    )
  }

  const options: ChartOptions<'bar'> = {
    maintainAspectRatio: false,
    responsive: true,
    layout: {
      // Room for the value label above the tallest bar.
      padding: { top: 14 },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { display: true, maxTicksLimit: 7, color: subtleColor },
        title: { display: false },
      },
      y: {
        grid: { color: borderColor },
        ticks: { display: true, color: subtleColor },
        title: { display: true, text: t('progress.volumeAxis'), color: subtleColor },
        beginAtZero: true,
      },
    },
    plugins: {
      legend: { display: false },
    },
  }

  const data = {
    labels: points.map((point) => point.label),
    datasets: [
      {
        // The most recent bar picks up momentum green.
        backgroundColor: points.map((_, index) =>
          index === points.length - 1 ? successColor : inkColor,
        ),
        borderRadius: 8,
        data: points.map((point) => point.volume),
        label: t('progress.trainingVolume'),
      },
    ],
  }

  return (
    <div className={styles.frame}>
      <Bar
        data={data}
        options={options}
        plugins={[latestValueLabel]}
        aria-label={
          granularity === 'week'
            ? t('progress.volumeChartWeeklyAria')
            : t('progress.volumeChartAria')
        }
        role="img"
      />
    </div>
  )
}
