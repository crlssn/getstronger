<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { getWorkout } from '@/http/requests.ts'
import { usePageTitleStore } from '@/stores/pageTitle'
import CardWorkout from '@/ui/components/CardWorkout.vue'
import { type Workout } from '@/proto/api/v1/workout_service_pb.ts'

const { t } = useI18n()
const route = useRoute()
const workout = ref<Workout>()
const loading = ref(true)
const pageTitleStore = usePageTitleStore()

onMounted(async () => {
  await fetchWorkout()
  pageTitleStore.setPageTitle(workout.value?.name ?? t('common.workout'))
  loading.value = false
})

const fetchWorkout = async () => {
  const res = await getWorkout(route.params.id as string)
  if (!res) return

  workout.value = res.workout
}
</script>

<template>
  <div v-if="loading" class="loading-card" aria-live="polite" aria-busy="true">
    <span class="sr-only">{{ $t('common.loading') }}</span>
    <div class="loading-line" aria-hidden="true"></div>
    <div class="loading-line" aria-hidden="true"></div>
    <div class="loading-line w-full" aria-hidden="true"></div>
  </div>
  <CardWorkout v-if="workout" :workout="workout" :compact="false" />
  <section v-else-if="!loading" class="empty-card">
    <h1>{{ t('workout.view.unavailable') }}</h1>
    <p>{{ t('workout.view.unavailableBody') }}</p>
    <RouterLink to="/workout">{{ t('workout.view.viewWorkouts') }}</RouterLink>
  </section>
</template>

<style scoped>
@reference '../../assets/base.css';

.loading-card,
.empty-card {
  @apply card mx-auto max-w-4xl p-6;
}
.loading-card {
  @apply space-y-4;
}
.loading-card span {
  @apply block h-4 animate-pulse rounded-full bg-ink-tint;
}
.loading-card span:nth-child(1) {
  @apply w-32;
}
.loading-card span:nth-child(2) {
  @apply h-8 w-52;
}
.empty-card h1 {
  @apply text-title font-semibold text-text;
}
.empty-card p {
  @apply mt-2 text-sm text-text-subtle;
}
.empty-card a {
  @apply mt-4 inline-flex min-h-(--size-control) items-center rounded-control bg-ink px-4 text-sm font-semibold text-white;
}
</style>
