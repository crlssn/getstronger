<script setup lang="ts">
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
import {Line as LineChart} from "vue-chartjs";
import type {Set} from '@/proto/api/v1/shared_pb.ts'
import {computed} from "vue";
import {formatToShortDateTime} from "@/utils/datetime.ts";

// Register Chart.js components globally
ChartJS.register(Title, Tooltip, Legend, LineElement, CategoryScale, LinearScale, PointElement);

const props = defineProps<{
  sets: Set[]
}>()

const options = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      grid: {
        drawBorder: false,
        display: false,
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
        drawBorder: false,
        display: false,
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
    labels: labels,
    datasets: [
      {
        label: 'Weight',
        backgroundColor: '#000000',
        data: weights,
      },
      {
        label: 'Reps',
        backgroundColor: '#4f46e5',
        data: reps,
      },
    ]
  }
})
</script>

<template>
  <div>
    <LineChart :data="data" :options="options"/>
  </div>
</template>

<style scoped></style>
