<script setup lang="ts">
import type { Set } from '@/proto/api/v1/shared_pb.ts'
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
  sets: Set[]
}>()

const options = {
  maintainAspectRatio: true,
  responsive: true,
  scales: {
    x: {
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

const sets = computed(() => [...props.sets].reverse())

const data = computed(() => {
  const labels: string[] = []
  const intensity: number[] = []
  const intensityByWorkout: Record<string, number> = {}

  sets.value.map((set) => {
    const workoutId = set.metadata?.workoutId;

    if (!workoutId) {
      return;
    }

    if (intensityByWorkout[workoutId]) {
      intensityByWorkout[workoutId] += set.reps * set.weight;
    } else {
      intensityByWorkout[workoutId] = set.reps * set.weight;
    }

    labels.push(formatToShortDateTime(set.metadata?.createdAt))
    intensity.push(intensityByWorkout[workoutId])
  })

  return {
    datasets: [
      {
        borderColor: '#4f46e5',
        borderWidth: 1,
        backgroundColor: '#4f46e5',
        data: intensity,
        label: 'Energy',
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
