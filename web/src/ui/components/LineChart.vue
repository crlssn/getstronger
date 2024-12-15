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
  },
}

const sets = computed(() => [...props.sets].reverse())

const data = computed(() => {
  const labels: string[] = []
  const weights: number[] = []
  const reps: number[] = []

  sets.value.map((set) => {
    labels.push(formatToShortDateTime(set.metadata?.createdAt))
    weights.push(set.weight)
    reps.push(set.reps)
  })

  return {
    datasets: [
      {
        borderColor: 'rgba(0, 0, 0, 0.3)',
        borderWidth: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        data: weights,
        label: 'Weight',
        tension: 0.4,
        pointRadius: 0,
        fill: true,
      },
      {
        borderColor: 'rgba(79,70,229,0.3)',
        borderWidth: 1,
        backgroundColor: 'rgba(79,70,229,0.2)',
        data: reps,
        label: 'Reps',
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
  <LineChart :data="data" :options="options" />
</template>

<style scoped></style>
