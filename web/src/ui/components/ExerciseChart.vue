<script setup lang="ts">
import type { Set } from '@/proto/api/v1/shared_pb.ts'

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

ChartJS.register(Tooltip, LineElement, CategoryScale, LinearScale, Filler, PointElement)

const props = defineProps<{
  sets: Set[]
}>()

type Metric = 'oneRm' | 'weight' | 'volume'

const metric = ref<Metric>('oneRm')
const metricOptions: Array<{ key: Metric; label: string }> = [
  { key: 'oneRm', label: 'Est. 1RM' },
  { key: 'weight', label: 'Weight' },
  { key: 'volume', label: 'Volume' },
]

const metricDetails: Record<Metric, { heading: string; unit: string }> = {
  oneRm: { heading: 'Estimated 1RM', unit: 'kg' },
  weight: { heading: 'Working weight', unit: 'kg' },
  volume: { heading: 'Daily volume', unit: 'kg' },
}

const calc1RM = (weight: number, reps: number): number => {
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

const dailyMetrics = computed(() => {
  const buckets = new Map<
    string,
    { label: string; timestamp: number; oneRm: number; weight: number; volume: number }
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
    }
    existing.oneRm = Math.max(existing.oneRm, calc1RM(set.weight, set.reps))
    existing.weight = Math.max(existing.weight, set.weight)
    existing.volume += set.weight * set.reps
    buckets.set(key, existing)
  })

  return [...buckets.values()].sort((first, second) => first.timestamp - second.timestamp)
})

const values = computed(() => dailyMetrics.value.map((day) => day[metric.value]))
const latestValue = computed(() => values.value[values.value.length - 1] ?? 0)
const change = computed(() => {
  const first = values.value[0]
  const last = values.value[values.value.length - 1]
  if (!first || last === undefined || values.value.length < 2) return ''
  const percentage = Math.round(((last - first) / first) * 100)
  if (!percentage) return 'No change'
  return `${percentage > 0 ? '+' : ''}${percentage}%`
})

const data = computed(() => ({
  datasets: [
    {
      backgroundColor: 'rgba(37, 40, 45, 0.10)',
      borderColor: '#25282d',
      borderWidth: 3,
      data: values.value,
      fill: true,
      label: metricDetails[metric.value].heading,
      pointBackgroundColor: '#ffffff',
      pointBorderColor: '#25282d',
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
      ticks: { color: '#64748b', maxTicksLimit: 6 },
    },
    y: {
      beginAtZero: false,
      grid: { color: '#e2e8f0' },
      ticks: { color: '#64748b' },
      title: {
        color: '#64748b',
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
        <strong
          >{{ Math.round(latestValue).toLocaleString() }} {{ metricDetails[metric].unit }}</strong
        >
      </div>
      <span v-if="change">{{ change }}</span>
    </header>

    <div class="metric-picker" aria-label="Exercise progress metric">
      <button
        v-for="option in metricOptions"
        :key="option.key"
        type="button"
        :class="{ active: metric === option.key }"
        @click="metric = option.key"
      >
        {{ option.label }}
      </button>
    </div>

    <div class="chart-frame">
      <LineChart :data="data" :options="options as any" />
    </div>
  </div>
</template>

<style scoped>
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
  @apply text-xs font-semibold uppercase tracking-wider text-slate-500;
}
.exercise-chart header strong {
  @apply text-xl font-semibold tracking-tight text-slate-950;
}
.exercise-chart header > span {
  @apply rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700;
}
.metric-picker {
  @apply grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1;
}
.metric-picker button {
  @apply min-h-10 rounded-lg text-xs font-semibold text-slate-500 transition hover:text-indigo-700;
}
.metric-picker button.active {
  @apply bg-indigo-100 text-indigo-800 shadow-sm;
}
.chart-frame {
  @apply h-64;
}
</style>
