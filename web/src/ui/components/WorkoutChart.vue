<script setup lang="ts">
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
  Scale,
} from 'chart.js'
import type { Workout } from '@/proto/api/v1/workout_service_pb.ts'

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
        display: false,
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
        display: false,
        drawBorder: false,
      },
      ticks: {
        display: true,
      },
      title: {
        display: false,
      },
    },
    yWeight: {
      legend: {
        display: false,
      },
      position: 'right',
      grid: {
        display: false,
        drawBorder: false,
      },
      afterBuildTicks: (axis: Scale) => {
        axis.ticks = [...axis.chart.scales.y.ticks]
        axis.min = axis.chart.scales.y.min
        axis.max = axis.chart.scales.y.max
      },
    },
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
        borderWidth: 1,
        backgroundColor: '#4f46e5',
        data: intensity,
        label: 'Weight Lifted',
        tension: 0.4,
        pointRadius: 0,
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
