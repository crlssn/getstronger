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

const options = {
  maintainAspectRatio: false,
  responsive: true,
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
        color: '#64748b',
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
        color: '#e2e8f0',
        drawBorder: false,
      },
      ticks: {
        display: true,
        color: '#64748b',
      },
      title: {
        display: true,
        text: 'Volume (kg)',
        color: '#64748b',
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
  return {
    datasets: [
      {
        backgroundColor: '#6366f1',
        borderRadius: 8,
        data: dailyVolume.value.map((day) => day.volume),
        label: 'Training volume',
      },
    ],
    labels: dailyVolume.value.map((day) => day.label),
  }
})
</script>

<template>
  <div class="chart-frame">
    <BarChart :data="data" :options="options as any" />
  </div>
</template>

<style scoped>
.chart-frame {
  @apply h-64;
}
</style>
