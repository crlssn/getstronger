<script setup lang="ts">
import type { Workout } from '@/proto/api/v1/workout_service_pb.ts'
import { computed } from 'vue'
import { Line as LineChart } from 'vue-chartjs'
import { formatToShortDateTime } from '@/utils/datetime.ts'
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js'

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  LineElement,
  CategoryScale,
  LinearScale,
  Filler,
  PointElement,
)

const props = defineProps<{
  workouts: Workout[]
}>()

const options = {
  maintainAspectRatio: true,
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
        maxTicksLimit: 6,
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
    },
  },
  plugins: {
    legend: { display: false },
  },
}

const workouts = computed(() => [...props.workouts].reverse())

const data = computed(() => {
  const labels: string[] = []
  const intensity: number[] = []

  workouts.value.map((workout) => {
    labels.push(formatToShortDateTime(workout.finishedAt))
    intensity.push(workout.intensity)
  })

  return {
    datasets: [
      {
        borderColor: '#4f46e5',
        borderWidth: 3,
        backgroundColor: 'rgba(79, 70, 229, 0.10)',
        data: intensity,
        label: 'Weight Lifted',
        tension: 0.4,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#4f46e5',
        pointRadius: 3,
        fill: true,
      },
    ],
    labels: labels,
  }
})
</script>

<template>
  <LineChart :data="data" :options="options as any" />
</template>

<style scoped></style>
