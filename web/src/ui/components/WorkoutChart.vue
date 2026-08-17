<script setup lang="ts">
import type { Workout } from '@/proto/api/v1/workout_service_pb.ts'
import { computed } from 'vue'
import { Bar as BarChart } from 'vue-chartjs'
import { DateTime } from 'luxon'
import { BarElement, Chart as ChartJS, CategoryScale, LinearScale, Tooltip } from 'chart.js'

ChartJS.register(Tooltip, BarElement, CategoryScale, LinearScale)

const props = defineProps<{
  workouts: Workout[]
}>()

// The chart reads its colours from the token layer rather than repeating hex
// values that theme.css already owns.
const token = (name: string, fallback: string) =>
  (typeof window !== 'undefined' &&
    getComputedStyle(document.documentElement).getPropertyValue(name).trim()) ||
  fallback

const inkColor = token('--color-ink', '#25282d')
const successColor = token('--color-success', '#047857')
const subtleColor = token('--color-text-subtle', '#656b71')
const borderColor = token('--color-border', '#e3e5e0')

// The latest bar carries its value, so the chart has a "today" story without
// needing a legend.
const latestValueLabel = {
  id: 'latestValueLabel',
  afterDatasetsDraw(chart: ChartJS) {
    const meta = chart.getDatasetMeta(0)
    const bar = meta.data[meta.data.length - 1]
    if (!bar) return
    const raw = chart.data.datasets[0]?.data[meta.data.length - 1]
    if (typeof raw !== 'number' || raw <= 0) return

    const { ctx } = chart
    ctx.save()
    ctx.font = `700 11px ${getComputedStyle(chart.canvas).fontFamily}`
    ctx.fillStyle = successColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(
      new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(raw),
      bar.x,
      bar.y - 4,
    )
    ctx.restore()
  },
}

const options = {
  maintainAspectRatio: false,
  responsive: true,
  layout: {
    // Room for the value label above the tallest bar.
    padding: { top: 14 },
  },
  scales: {
    x: {
      legend: {
        display: false,
      },
      grid: {
        display: false,
        drawBorder: true,
      },
      ticks: {
        display: true,
        maxTicksLimit: 7,
        color: subtleColor,
      },
      title: {
        display: false,
      },
    },
    y: {
      legend: {
        display: false,
      },
      grid: {
        color: borderColor,
        drawBorder: false,
      },
      ticks: {
        display: true,
        color: subtleColor,
      },
      title: {
        display: true,
        text: 'Volume (kg)',
        color: subtleColor,
      },
      beginAtZero: true,
    },
  },
  plugins: {
    legend: { display: false },
  },
}

const dailyVolume = computed(() => {
  const buckets = new Map<string, { label: string; timestamp: number; volume: number }>()

  props.workouts.forEach((workout) => {
    if (!workout.finishedAt) return
    const finishedAt = DateTime.fromSeconds(Number(workout.finishedAt.seconds))
    if (!finishedAt.isValid) return

    const key = finishedAt.toISODate()
    if (!key) return
    const existing = buckets.get(key)
    buckets.set(key, {
      label: finishedAt.toFormat('d LLL'),
      timestamp: finishedAt.toMillis(),
      volume: (existing?.volume ?? 0) + workout.intensity,
    })
  })

  return [...buckets.values()].sort((first, second) => first.timestamp - second.timestamp)
})

const data = computed(() => {
  const days = dailyVolume.value
  return {
    datasets: [
      {
        // The most recent day picks up momentum green.
        backgroundColor: days.map((_, index) => (index === days.length - 1 ? successColor : inkColor)),
        borderRadius: 8,
        data: days.map((day) => day.volume),
        label: 'Training volume',
      },
    ],
    labels: days.map((day) => day.label),
  }
})
</script>

<template>
  <div class="chart-frame">
    <BarChart
      :data="data"
      :options="options as any"
      :plugins="[latestValueLabel]"
      aria-label="Training volume by day"
      role="img"
    />
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.chart-frame {
  @apply h-64;
}
</style>
