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

const calc1RM = (weight: number, reps: number): number => {
  if (reps === 1) {
    return weight
  }

  return weight * (1 + reps / 30)
}

const sets = computed(() => [...props.sets].reverse())

const data = computed(() => {
  const labels: string[] = []
  const weights: number[] = []
  const reps: number[] = []
  const oneRM: number[] = []

  sets.value.map((set) => {
    labels.push(formatToShortDateTime(set.metadata?.createdAt))
    weights.push(set.weight)
    reps.push(set.reps)
    oneRM.push(calc1RM(set.weight, set.reps))
  })

  return {
    datasets: [
      {
        borderColor: '#818cf8',
        borderWidth: 1,
        backgroundColor: '#818cf8',
        data: reps,
        label: 'Reps',
        tension: 0.4,
        pointRadius: 0,
        fill: true,
      },
      {
        borderColor: '#6366f1',
        borderWidth: 1,
        backgroundColor: '#6366f1',
        data: weights,
        label: 'Weight',
        tension: 0.4,
        pointRadius: 0,
        fill: true,
      },
      {
        borderColor: '#4f46e5',
        borderWidth: 1,
        backgroundColor: '#4f46e5',
        data: oneRM,
        label: '1RM',
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
