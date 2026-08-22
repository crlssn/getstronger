import type { Workout } from '@/proto/api/v1/workout_service_pb'
import type { ChartOptions } from 'chart.js'

import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from 'chart.js'
import { useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import { useTranslation } from 'react-i18next'

import { borderColor, inkColor, subtleColor, successColor } from '@/ui/chartTokens'
import { latestValueLabel } from '@/ui/features/latestValueLabel'
import { dailyVolume } from '@/utils/dailyVolume'
import styles from './WorkoutChart.module.css'

ChartJS.register(Tooltip, BarElement, CategoryScale, LinearScale)

interface Props {
  workouts: Workout[]
}

/** Daily training volume as bars, with the most recent day picked out. */
export const WorkoutChart = ({ workouts }: Props) => {
  const { t } = useTranslation()

  const days = useMemo(() => dailyVolume(workouts), [workouts])

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
    labels: days.map((day) => day.label),
    datasets: [
      {
        // The most recent day picks up momentum green.
        backgroundColor: days.map((_, index) =>
          index === days.length - 1 ? successColor : inkColor,
        ),
        borderRadius: 8,
        data: days.map((day) => day.volume),
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
        aria-label={t('progress.volumeChartAria')}
        role="img"
      />
    </div>
  )
}
