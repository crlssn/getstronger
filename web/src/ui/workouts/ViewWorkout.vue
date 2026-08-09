<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getWorkout } from '@/http/requests.ts'
import { usePageTitleStore } from '@/stores/pageTitle'
import CardWorkout from '@/ui/components/CardWorkout.vue'
import { type Workout } from '@/proto/api/v1/workout_service_pb.ts'

const route = useRoute()
const workout = ref<Workout>()
const loading = ref(true)
const pageTitleStore = usePageTitleStore()

onMounted(async () => {
  await fetchWorkout()
  pageTitleStore.setPageTitle(workout.value?.name ?? 'Workout')
  loading.value = false
})

const fetchWorkout = async () => {
  const res = await getWorkout(route.params.id as string)
  if (!res) return

  workout.value = res.workout
}
</script>

<template>
  <div v-if="loading" class="loading-card"><span></span><span></span><span></span></div>
  <CardWorkout v-if="workout" :workout="workout" :compact="false" />
  <section v-else-if="!loading" class="empty-card">
    <h1>Workout unavailable</h1>
    <p>This workout could not be loaded or no longer exists.</p>
    <RouterLink to="/workout">Back to workouts</RouterLink>
  </section>
</template>

<style scoped>
@reference '../../assets/base.css';

.loading-card,
.empty-card {
  @apply mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm;
}
.loading-card {
  @apply space-y-4;
}
.loading-card span {
  @apply block h-4 animate-pulse rounded-full bg-slate-100;
}
.loading-card span:nth-child(1) {
  @apply w-32;
}
.loading-card span:nth-child(2) {
  @apply h-8 w-52;
}
.empty-card h1 {
  @apply text-xl font-semibold text-slate-950;
}
.empty-card p {
  @apply mt-2 text-sm text-slate-500;
}
.empty-card a {
  @apply mt-4 inline-flex min-h-11 items-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white;
}
</style>
