<script setup lang="ts">
import type {Set} from '@/proto/api/v1/shared_pb.ts'

import {computed} from "vue";
import {Line as LineChart} from "vue-chartjs";
import {formatToShortDateTime} from "@/utils/datetime.ts";
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";

// Register Chart.js components globally
ChartJS.register(Title, Tooltip, Legend, LineElement, CategoryScale, LinearScale, PointElement);

const props = defineProps<{
  sets: Set[]
}>()

const options = {
  maintainAspectRatio: false,
  responsive: true,
  scales: {
    x: {
      grid: {
        display: false,
        drawBorder: false,
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
        display: false,
      },
      title: {
        display: false,
      },
    },
  },
};

const data = computed(() => {
  const labels = []
  const weights = []
  const reps = []

  props.sets.map(set => {
      labels.push(formatToShortDateTime(set.createdAt))
      weights.push(set.weight)
      reps.push(set.reps)
  })

  return {
    datasets: [
      {
        backgroundColor: '#000000',
        data: weights,
        label: 'Weight',
      },
      {
        backgroundColor: '#4f46e5',
        data: reps,
        label: 'Reps',
      },
    ],
    labels: labels
  }
})
</script>

<template>
  <div>
    <LineChart
      :data="data"
      :options="options"
    />
  </div>
</template>

<style scoped></style>
