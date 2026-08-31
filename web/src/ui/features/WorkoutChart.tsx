import type { Workout } from '@/proto/api/v1/workout_service_pb'
import type { ChartOptions } from 'chart.js'

import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from 'chart.js'
import { useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import { useTranslation } from 'react-i18next'

import { selectTheme, useLocaleStore } from '@/stores/locale'
import { borderColor, chartBarColor, inkColor, subtleColor } from '@/ui/chartTokens'
import { latestValueLabel } from '@/ui/features/latestValueLabel'
import { volumeSeries } from '@/utils/dailyVolume'
import { formatNumber } from '@/utils/numbers'
import { usePrefersReducedMotion } from '@/utils/usePrefersReducedMotion'
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
  const stillness = usePrefersReducedMotion()
  // Subscribed for the re-render alone: the token reads below answer in
  // whichever palette is on the root element by then.
  useLocaleStore(selectTheme)

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
    // A canvas animation is still an animation, and no media query reaches one.
    animation: stillness ? false : undefined,
    maintainAspectRatio: false,
    responsive: true,
    layout: {
      // Room for the value pill above the tallest bar.
      padding: { top: 28 },
    },
    scales: {
      // The value label above the current bar carries the number, so the y
      // axis says nothing: no labels, no title, no gridlines. One baseline
      // hairline under the bars is all the scaffolding the trend needs.
      x: {
        border: { color: borderColor() },
        grid: { display: false },
        ticks: {
          display: true,
          maxTicksLimit: 7,
          // Horizontal always — a rotated label is unreadable at a glance —
          // and the current period reads in ink where the rest stay subtle.
          maxRotation: 0,
          color: (context) => (context.index === points.length - 1 ? inkColor() : subtleColor()),
          font: (context) => (context.index === points.length - 1 ? { weight: 700 } : {}),
        },
        title: { display: false },
      },
      y: {
        border: { display: false },
        grid: { display: false },
        ticks: { display: false },
        title: { display: false },
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
        // The latest bar is picked out by weight, not by hue: it takes full
        // ink and the rest step back to the pale neutral. Green was saying
        // "this week" here as well as four other things.
        backgroundColor: points.map((_, index) =>
          index === points.length - 1 ? inkColor() : chartBarColor(),
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
