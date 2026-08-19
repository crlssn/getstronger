<script setup lang="ts">
import { ExerciseMetric, type Exercise, type Set } from '@/proto/api/v1/shared_pb.ts'

import { computed, ref } from 'vue'
import { DateTime } from 'luxon'
import { Line as LineChart } from 'vue-chartjs'
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { exerciseMetrics, formatDurationDisplay } from '@/utils/exerciseMeasurements'
import { weightInKilograms } from '@/utils/weightUnits'
import { distanceInKilometers } from '@/utils/distanceUnits'

ChartJS.register(Tooltip, LineElement, CategoryScale, LinearScale, Filler, PointElement)

const props = defineProps<{
  sets: Set[]
  exercise: Pick<Exercise, 'metrics'>
}>()

type Metric = 'oneRm' | 'weight' | 'volume' | 'reps' | 'distance' | 'durationSeconds'

const selectedMetrics = computed(() => exerciseMetrics(props.exercise))
const hasWeightAndReps = computed(
  () =>
    selectedMetrics.value.includes(ExerciseMetric.WEIGHT) &&
    selectedMetrics.value.includes(ExerciseMetric.REPS),
)
const metricOptions = computed<Array<{ key: Metric; label: string }>>(() => {
  const options: Array<{ key: Metric; label: string }> = []
  if (hasWeightAndReps.value) options.push({ key: 'oneRm', label: 'Est. 1RM' })
  if (selectedMetrics.value.includes(ExerciseMetric.WEIGHT))
    options.push({ key: 'weight', label: 'Weight' })
  if (selectedMetrics.value.includes(ExerciseMetric.REPS))
    options.push({ key: 'reps', label: 'Reps' })
  if (selectedMetrics.value.includes(ExerciseMetric.DISTANCE))
    options.push({ key: 'distance', label: 'Distance' })
  if (selectedMetrics.value.includes(ExerciseMetric.TIME))
    options.push({ key: 'durationSeconds', label: 'Time' })
  if (hasWeightAndReps.value) options.push({ key: 'volume', label: 'Volume' })
  return options
})
const metric = ref<Metric>(metricOptions.value[0]?.key ?? 'weight')

const metricDetails: Record<Metric, { heading: string; unit: string }> = {
  oneRm: { heading: 'Estimated 1RM', unit: 'kg' },
  weight: { heading: 'Working weight', unit: 'kg' },
  volume: { heading: 'Daily volume', unit: 'kg' },
  reps: { heading: 'Most reps', unit: 'reps' },
  distance: { heading: 'Longest distance', unit: 'km' },
  durationSeconds: { heading: 'Longest time', unit: '' },
}

const calc1RM = (weight: number, reps: number): number => {
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

const dailyMetrics = computed(() => {
  const buckets = new Map<
    string,
    {
      label: string
      timestamp: number
      oneRm: number
      weight: number
      volume: number
      reps: number
      distance: number
      durationSeconds: number
    }
  >()

  props.sets.forEach((set) => {
    const createdAt = set.metadata?.createdAt
    if (!createdAt) return
    const date = DateTime.fromSeconds(Number(createdAt.seconds))
    if (!date.isValid) return
    const key = date.toISODate()
    if (!key) return

    const existing = buckets.get(key) ?? {
      label: date.toFormat('d LLL'),
      timestamp: date.toMillis(),
      oneRm: 0,
      weight: 0,
      volume: 0,
      reps: 0,
      distance: 0,
      durationSeconds: 0,
    }
    const weight = weightInKilograms(set.weight, set.weightUnit)
    existing.oneRm = Math.max(existing.oneRm, calc1RM(weight, set.reps))
    existing.weight = Math.max(existing.weight, weight)
    existing.volume += weight * set.reps
    existing.reps = Math.max(existing.reps, set.reps)
    // Sets may have been logged under different unit preferences over time, so
    // the chart aggregates in the canonical unit like it does for weight.
    existing.distance = Math.max(
      existing.distance,
      distanceInKilometers(set.distance, set.distanceUnit),
    )
    existing.durationSeconds = Math.max(existing.durationSeconds, set.durationSeconds)
    buckets.set(key, existing)
  })

  return [...buckets.values()].sort((first, second) => first.timestamp - second.timestamp)
})

const values = computed(() => dailyMetrics.value.map((day) => day[metric.value]))
const latestValue = computed(() => values.value[values.value.length - 1] ?? 0)
const formattedLatestValue = computed(() =>
  metric.value === 'durationSeconds'
    ? formatDurationDisplay(latestValue.value)
    : `${Math.round(latestValue.value).toLocaleString()} ${metricDetails[metric.value].unit}`.trim(),
)
const hasTrend = computed(() => dailyMetrics.value.length > 1)
const change = computed(() => {
  const first = values.value[0]
  const last = values.value[values.value.length - 1]
  if (!first || last === undefined || values.value.length < 2) return ''
  const percentage = Math.round(((last - first) / first) * 100)
  if (!percentage) return 'No change'
  return `${percentage > 0 ? '+' : ''}${percentage}%`
})

// Colours come from the token layer, not hex values repeated in JS.
const token = (name: string, fallback: string) =>
  (typeof window !== 'undefined' &&
    getComputedStyle(document.documentElement).getPropertyValue(name).trim()) ||
  fallback

const inkColor = token('--color-ink', '#25282d')
const subtleColor = token('--color-text-subtle', '#656b71')
const chartBorderColor = token('--color-border', '#e3e5e0')

const data = computed(() => ({
  datasets: [
    {
      backgroundColor: 'rgba(37, 40, 45, 0.10)',
      borderColor: inkColor,
      borderWidth: 3,
      data: values.value,
      fill: true,
      label: metricDetails[metric.value].heading,
      pointBackgroundColor: '#ffffff',
      pointBorderColor: inkColor,
      pointBorderWidth: 2,
      pointRadius: 4,
      tension: 0.35,
    },
  ],
  labels: dailyMetrics.value.map((day) => day.label),
}))

const options = computed(() => ({
  maintainAspectRatio: false,
  responsive: true,
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: subtleColor, maxTicksLimit: 6 },
    },
    y: {
      beginAtZero: false,
      grid: { color: chartBorderColor },
      ticks: { color: subtleColor },
      title: {
        color: subtleColor,
        display: true,
        text: metricDetails[metric.value].unit,
      },
    },
  },
  plugins: {
    legend: { display: false },
  },
}))
</script>

<template>
  <div class="exercise-chart">
    <header>
      <div>
        <small>{{ metricDetails[metric].heading }}</small>
        <strong>{{ formattedLatestValue }}</strong>
      </div>
      <span v-if="change">{{ change }}</span>
    </header>

    <div class="segmented" aria-label="Exercise progress metric">
      <button
        v-for="option in metricOptions"
        :key="option.key"
        type="button"
        :class="{ 'is-selected': metric === option.key }"
        :aria-pressed="metric === option.key"
        @click="metric = option.key"
      >
        {{ option.label }}
      </button>
    </div>

    <div v-if="hasTrend" class="chart-frame">
      <LineChart :data="data" :options="options as any" />
    </div>
    <div v-else class="first-result" role="status">
      <span aria-hidden="true"></span>
      <strong>{{ dailyMetrics.length ? 'First result logged' : 'No results yet' }}</strong>
      <p>
        {{
          dailyMetrics.length
            ? 'Log this exercise on another day to start seeing your trend.'
            : 'Your progress will appear after you log this exercise.'
        }}
      </p>
    </div>
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.exercise-chart {
  @apply space-y-4;
}
.exercise-chart header {
  @apply flex items-end justify-between gap-3;
}
.exercise-chart header > div {
  @apply grid gap-1;
}
.exercise-chart header small {
  @apply text-eyebrow font-bold uppercase text-text-subtle;
}
.exercise-chart header strong {
  @apply text-title font-semibold text-text;
}
.exercise-chart header > span {
  @apply rounded-full bg-success-surface px-2.5 py-1 text-xs font-semibold text-success;
}
.chart-frame {
  @apply h-64;
}
.first-result {
  @apply grid min-h-52 place-items-center content-center gap-2 rounded-card bg-ink-surface px-6 text-center;
}
.first-result > span {
  @apply mb-2 size-4 rounded-full border-4 border-ink bg-white;
  box-shadow: 0 0 0 8px var(--color-ink-tint);
}
.first-result strong {
  @apply text-base font-semibold text-text;
}
.first-result p {
  @apply max-w-sm text-sm leading-6 text-text-subtle;
}
</style>
