<script setup lang="ts">
import { type Exercise, type Set } from '@/proto/api/v1/shared_pb.ts'

import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  BoltIcon,
  ChevronRightIcon,
  PencilIcon,
  TrashIcon,
  TrophyIcon,
} from '@heroicons/vue/24/outline'
import { useI18n } from 'vue-i18n'

import router from '@/router/router'
import { useAuthStore } from '@/stores/auth.ts'
import { useAlertStore } from '@/stores/alerts'
import { usePageTitleStore } from '@/stores/pageTitle'
import { useWorkoutStore } from '@/stores/workout'
import ExerciseChart from '@/ui/components/ExerciseChart.vue'
import { formatToShortDateTime } from '@/utils/datetime.ts'
import { deleteExercise, getExercise, listSets } from '@/http/requests'
import usePagination from '@/utils/usePagination'
import ExerciseTags from '@/ui/exercises/ExerciseTags.vue'
import { formatExerciseSet } from '@/utils/exerciseMeasurements'
import useActiveWorkout from '@/utils/useActiveWorkout'

const sets = ref<Set[]>([])
const exercise = ref<Exercise>()
const loading = ref(true)

const route = useRoute()
const authStore = useAuthStore()
const pageTitle = usePageTitleStore()
const alertStore = useAlertStore()
const workoutStore = useWorkoutStore()
const { t } = useI18n()
const { savedRoutineName, savedWorkout } = useActiveWorkout()
const { hasMorePages, pageToken, resolvePageToken } = usePagination()

onMounted(async () => {
  const response = await getExercise(route.params.id as string)
  if (response?.exercise) {
    exercise.value = response.exercise
    pageTitle.setPageTitle(response.exercise.name)
    await fetchSets()
  }
  loading.value = false
})

const fetchSets = async () => {
  const response = await listSets([], [route.params.id as string], pageToken.value)
  if (!response) return

  sets.value = [...sets.value, ...response.sets]
  pageToken.value = resolvePageToken(response.pagination)
}

const onDeleteExercise = async () => {
  if (!confirm(`Delete “${exercise.value?.name ?? 'this exercise'}”? This cannot be undone.`)) {
    return
  }

  await deleteExercise(route.params.id as string)
  alertStore.setError('Exercise deleted')
  await router.push('/exercises')
}

const onStartQuickWorkout = async () => {
  if (!exercise.value) return

  const activeRoutineID = savedWorkout.value?.[0]
  if (
    activeRoutineID &&
    !confirm(
      t('exercise.replaceWorkoutConfirm', {
        workout: savedRoutineName.value,
        exercise: exercise.value.name,
      }),
    )
  ) {
    return
  }

  if (activeRoutineID) workoutStore.removeWorkout(activeRoutineID)
  workoutStore.startQuickWorkoutWithExercise(exercise.value)
  await router.push('/workouts/quick')
}

const downSample = (data: Set[], sampleSize: number): Set[] => {
  if (data.length <= sampleSize) return data
  const sampled: Set[] = []
  const step = Math.ceil(data.length / sampleSize)
  for (let index = 0; index < data.length; index += step) sampled.push(data[index])
  return sampled
}
</script>

<template>
  <div v-if="loading" class="loading-card">Loading exercise…</div>
  <div v-else-if="exercise" class="exercise-detail">
    <ExerciseTags :tags="exercise.tags" />

    <button
      v-if="authStore.userId === exercise.userId"
      type="button"
      class="start-quick-card"
      @click="onStartQuickWorkout"
    >
      <span class="start-quick-icon"><BoltIcon /></span>
      <span class="start-quick-copy">
        <strong>{{ t('exercise.startQuickWorkout') }}</strong>
        <small>{{ t('exercise.startQuickWorkoutBody', { name: exercise.name }) }}</small>
      </span>
      <ChevronRightIcon class="start-quick-chevron" />
    </button>

    <section v-if="authStore.userId === exercise.userId" class="manage-card">
      <div class="manage-heading">
        <p class="eyebrow">Manage exercise</p>
        <h2>Exercise settings</h2>
      </div>
      <div class="manage-actions">
        <RouterLink :to="`/exercises/${route.params.id}/edit`">
          <PencilIcon /> Update exercise <ChevronRightIcon />
        </RouterLink>
        <button type="button" @click="onDeleteExercise"><TrashIcon /> Delete exercise</button>
      </div>
    </section>

    <section v-if="sets.length" class="chart-card">
      <p class="eyebrow">Trend</p>
      <ExerciseChart :sets="downSample(sets, 60)" :exercise="exercise" />
    </section>

    <section class="sets-card">
      <header>
        <div>
          <p class="eyebrow">History</p>
          <h1>Logged sets</h1>
        </div>
        <span>{{ sets.length }}</span>
      </header>

      <div v-if="sets.length" class="set-list">
        <RouterLink v-for="set in sets" :key="set.id" :to="`/workouts/${set.metadata?.workoutId}`">
          <span class="set-copy">
            <strong>{{ formatExerciseSet(set, exercise) }}</strong>
            <small>{{ formatToShortDateTime(set.metadata?.createdAt) }}</small>
          </span>
          <span v-if="set.metadata?.personalBest" class="record-pill"><TrophyIcon /> PR</span>
          <ChevronRightIcon />
        </RouterLink>
      </div>
      <p v-else class="empty-copy">Log this exercise in a workout to start its history.</p>

      <button v-if="hasMorePages" type="button" class="load-more" @click="fetchSets">
        Load more sets
      </button>
    </section>
  </div>
  <section v-else class="empty-card">
    <h1>Exercise unavailable</h1>
    <p>This exercise could not be loaded or no longer exists.</p>
    <RouterLink to="/exercises">Back to exercises</RouterLink>
  </section>
</template>

<style scoped>
.exercise-detail {
  @apply mx-auto max-w-3xl space-y-5;
}
.loading-card,
.empty-card,
.chart-card,
.sets-card {
  @apply rounded-2xl border border-slate-200 bg-white p-5 shadow-sm;
}
.manage-card {
  @apply overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm;
}
.start-quick-card {
  @apply flex min-h-20 w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50;
}
.start-quick-icon {
  @apply flex size-12 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white;
}
.start-quick-icon svg {
  @apply size-6;
}
.start-quick-copy {
  @apply min-w-0 flex-1;
}
.start-quick-copy strong,
.start-quick-copy small {
  @apply block;
}
.start-quick-copy strong {
  @apply text-sm font-semibold text-slate-950;
}
.start-quick-copy small {
  @apply mt-1 truncate text-xs text-slate-500;
}
.start-quick-chevron {
  @apply size-5 shrink-0 text-slate-400;
}
.loading-card {
  @apply text-sm text-slate-500;
}
.eyebrow {
  @apply mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500;
}
.chart-card {
  @apply space-y-4;
}
.sets-card > header {
  @apply -mx-5 -mt-5 flex items-end justify-between gap-3 px-5 py-5;
}
.sets-card h1,
.manage-card h2,
.empty-card h1 {
  @apply text-xl font-semibold tracking-tight text-slate-950;
}
.sets-card > header > span {
  @apply rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500;
}
.set-list {
  @apply -mx-5 divide-y divide-slate-100 border-t border-slate-100;
}
.set-list > a {
  @apply grid min-h-16 grid-cols-[1fr_auto_auto] items-center gap-3 px-5 py-3 transition hover:text-indigo-700;
}
.set-copy {
  @apply min-w-0;
}
.set-copy strong,
.set-copy small {
  @apply block;
}
.set-copy strong {
  @apply text-sm font-semibold text-slate-950;
}
.set-copy small {
  @apply mt-1 text-xs text-slate-500;
}
.record-pill {
  @apply inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700;
}
.record-pill svg,
.set-list > a > svg {
  @apply size-4;
}
.set-list > a > svg {
  @apply text-slate-400;
}
.empty-copy {
  @apply rounded-xl bg-slate-50 p-4 text-sm text-slate-500;
}
.load-more {
  @apply mt-3 min-h-11 w-full rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50;
}
.manage-heading {
  @apply p-5;
}
.manage-heading .eyebrow {
  @apply mb-1;
}
.manage-actions {
  @apply divide-y divide-slate-100 border-t border-slate-100;
}
.manage-actions a,
.manage-actions button {
  @apply flex min-h-14 w-full items-center gap-3 px-5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50;
}
.manage-actions a svg,
.manage-actions button svg {
  @apply size-5;
}
.manage-actions a svg:last-child {
  @apply ml-auto text-slate-400;
}
.manage-actions button {
  @apply text-red-600 hover:bg-red-50;
}
.empty-card p {
  @apply mt-2 text-sm text-slate-500;
}
.empty-card a {
  @apply mt-4 inline-flex min-h-11 items-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white;
}
</style>
