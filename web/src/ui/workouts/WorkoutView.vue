<script setup lang="ts">
import type { Workout } from '@/proto/api/v1/workout_service_pb'

import { useIntersectionObserver } from '@vueuse/core'
import {
  BoltIcon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  PlayIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import { computed, nextTick, onMounted, ref } from 'vue'

import { listWorkouts } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import { usePlanStore } from '@/stores/plans'
import { formatToShortDateTime } from '@/utils/datetime'
import useActiveWorkout from '@/utils/useActiveWorkout'

const authStore = useAuthStore()
const dashboardStore = useDashboardStore()
const planStore = usePlanStore()
const { discardSavedWorkout, savedHref, savedRoutineName, savedWorkout, savedWorkoutStarted } =
  useActiveWorkout()
const previousWorkouts = ref<Workout[]>([])
const historyPageToken = ref(new Uint8Array(0))
const historySentinel = ref<HTMLElement | null>(null)
const historyLoading = ref(false)
const historyInitiallyLoaded = ref(false)
const historyReachedEnd = ref(false)
const historyError = ref(false)
const activePlan = computed(() => dashboardStore.activePlan)
const nextRoutine = computed(() => dashboardStore.nextRoutine)
const plannedStart = computed(() =>
  nextRoutine.value
    ? {
        path: `/workouts/routine/${nextRoutine.value.id}`,
        query: activePlan.value ? { plan_id: activePlan.value.id } : {},
      }
    : '/plans',
)
const loadMoreHistory = async () => {
  if (historyLoading.value || historyReachedEnd.value || !authStore.userId) return

  historyLoading.value = true
  historyError.value = false
  const response = await listWorkouts([authStore.userId], historyPageToken.value)
  historyInitiallyLoaded.value = true

  if (!response) {
    historyError.value = true
    historyLoading.value = false
    return
  }

  const existingIds = new Set(previousWorkouts.value.map((workout) => workout.id))
  previousWorkouts.value.push(
    ...response.workouts.filter((workout) => !existingIds.has(workout.id)),
  )

  const nextPageToken = response.pagination?.nextPageToken ?? new Uint8Array(0)
  historyPageToken.value = nextPageToken
  historyReachedEnd.value = nextPageToken.length === 0
  historyLoading.value = false

  await nextTick()
  const sentinelTop = historySentinel.value?.getBoundingClientRect().top
  if (
    sentinelTop !== undefined &&
    sentinelTop <= window.innerHeight + 400 &&
    !historyReachedEnd.value
  ) {
    void loadMoreHistory()
  }
}

useIntersectionObserver(
  historySentinel,
  ([entry]) => {
    if (entry?.isIntersecting) void loadMoreHistory()
  },
  { rootMargin: '400px 0px' },
)

onMounted(async () => Promise.all([dashboardStore.load(), planStore.load(), loadMoreHistory()]))

const skip = async () => {
  if (!activePlan.value || !nextRoutine.value) return
  if (!confirm(`Skip ${nextRoutine.value.name}? No workout will be logged.`)) return
  if (await planStore.skip(activePlan.value.id)) await dashboardStore.load()
}
</script>

<template>
  <div class="workout-page">
    <header class="page-intro">
      <p class="eyebrow">Start workout</p>
      <h1>Workout</h1>
      <p>Start your planned session or work out without a routine.</p>
    </header>
    <section v-if="savedWorkout" class="active-session">
      <div>
        <p class="eyebrow">Active workout</p>
        <h2>{{ savedRoutineName }}</h2>
        <p class="active-meta"><ClockIcon /> {{ savedWorkoutStarted }}</p>
      </div>
      <div class="active-actions">
        <RouterLink :to="savedHref">Resume workout <ChevronRightIcon /></RouterLink>
        <button type="button" @click="discardSavedWorkout"><TrashIcon /> Discard workout</button>
      </div>
    </section>
    <section v-else-if="nextRoutine" class="next-card">
      <header>
        <p class="eyebrow">{{ activePlan ? 'Active plan' : 'Up next' }}</p>
        <span v-if="activePlan"
          >{{ activePlan.currentPosition + 1 }} of {{ activePlan.routines.length }}</span
        >
      </header>
      <h2>{{ nextRoutine.name }}</h2>
      <p v-if="activePlan" class="plan-name">{{ activePlan.name }}</p>
      <p>
        {{ nextRoutine.exercises.length }} exercises · About
        {{ Math.max(30, nextRoutine.exercises.length * 8) }} min
      </p>
      <RouterLink :to="plannedStart"><PlayIcon /> Start routine</RouterLink>
      <button v-if="activePlan" type="button" class="skip-button" @click="skip">
        Skip this routine
      </button>
    </section>
    <section v-else-if="!savedWorkout" class="empty-card">
      <h2>No workout selected</h2>
      <p>Create a routine or activate a plan to choose what comes next.</p>
      <RouterLink to="/plans">Choose a routine</RouterLink>
    </section>
    <RouterLink to="/workouts/quick" class="quick-card"
      ><span class="quick-icon"><BoltIcon /></span
      ><span
        ><strong>Quick workout</strong
        ><small>Build as you go · won’t advance your plan</small></span
      ><ChevronRightIcon
    /></RouterLink>

    <section class="workout-history">
      <header>
        <p class="eyebrow">History</p>
        <h2>Previous workouts</h2>
      </header>

      <div v-if="previousWorkouts.length" class="history-list">
        <RouterLink
          v-for="workout in previousWorkouts"
          :key="workout.id"
          :to="`/workouts/${workout.id}`"
        >
          <span>
            <strong>{{ workout.name }}</strong>
            <small><CalendarDaysIcon /> {{ formatToShortDateTime(workout.finishedAt) }}</small>
          </span>
          <ChevronRightIcon />
        </RouterLink>
      </div>

      <div v-if="!historyInitiallyLoaded" class="history-status" aria-live="polite">
        <span class="history-spinner"></span> Loading workout history…
      </div>
      <div v-else-if="historyError" class="history-error" role="alert">
        <span>Workout history could not be loaded.</span>
        <button type="button" @click="loadMoreHistory">Try again</button>
      </div>
      <div v-else-if="!previousWorkouts.length" class="history-empty">
        Your completed workouts will appear here.
      </div>
      <div v-else-if="historyLoading" class="history-status" aria-live="polite">
        <span class="history-spinner"></span> Loading more workouts…
      </div>
      <div v-else-if="historyReachedEnd" class="history-end" role="status">
        <CheckIcon /> You’ve reached the end of your workout history.
      </div>
      <div ref="historySentinel" class="history-sentinel" aria-hidden="true"></div>
    </section>
  </div>
</template>

<style scoped>
.workout-page {
  @apply space-y-4;
}
.page-intro {
  @apply px-1;
}
.eyebrow {
  @apply text-xs font-semibold uppercase tracking-wider text-slate-500;
}
h1 {
  @apply mt-1 text-2xl font-semibold tracking-tight text-slate-950;
}
h2 {
  @apply text-2xl font-semibold tracking-tight;
}
.page-intro > p:last-child {
  @apply mt-1 text-sm text-slate-500;
}
.quick-card {
  @apply grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm;
}
.quick-card > span:nth-child(2) {
  @apply min-w-0;
}
.quick-card strong,
.quick-card small {
  @apply block truncate;
}
.quick-card small {
  @apply mt-1 text-xs text-slate-500;
}
.quick-card > svg {
  @apply size-5 text-slate-400;
}
.active-session {
  @apply grid gap-5 rounded-3xl border border-stone-300 bg-stone-50 p-5 shadow-sm sm:grid-cols-[1fr_auto] sm:items-end sm:p-6;
}
.active-session h2 {
  @apply mt-1;
}
.active-meta {
  @apply mt-3 flex items-center gap-2 text-sm text-stone-700;
}
.active-meta svg {
  @apply size-4;
}
.active-actions {
  @apply grid gap-1 sm:min-w-48;
}
.active-actions > a {
  @apply inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 text-sm font-semibold text-white transition hover:bg-stone-800;
}
.active-actions > a svg {
  @apply size-5;
}
.active-actions > button {
  @apply inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-stone-500 transition hover:bg-stone-200/70 hover:text-red-600;
}
.active-actions > button svg {
  @apply size-4;
}
.next-card {
  @apply rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-6 text-white shadow-lg shadow-indigo-200;
}
.next-card > header {
  @apply flex items-center justify-between gap-3;
}
.next-card .eyebrow {
  @apply text-indigo-100;
}
.next-card > header span {
  @apply rounded-full border border-white/20 bg-white/15 px-3 py-1 text-xs font-semibold;
}
.next-card h2 {
  @apply mt-3;
}
.next-card > p {
  @apply mt-2 text-sm text-indigo-100;
}
.next-card .plan-name {
  @apply font-semibold text-white;
}
.next-card > a {
  @apply mt-5 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-indigo-700;
}
.next-card > a svg {
  @apply size-5;
}
.skip-button {
  @apply mt-2 min-h-10 w-full text-sm font-semibold text-indigo-100;
}
.empty-card {
  @apply rounded-2xl border border-slate-200 bg-white p-5 shadow-sm;
}
.empty-card p {
  @apply mt-1 text-sm text-slate-500;
}
.empty-card a {
  @apply mt-4 inline-flex min-h-11 items-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white;
}
.quick-card {
  @apply grid-cols-[3rem_1fr_auto];
}
.quick-icon {
  @apply grid size-12 place-items-center rounded-xl bg-indigo-100 text-indigo-700;
}
.quick-icon svg {
  @apply size-6;
}
.workout-history {
  @apply pt-3;
}
.workout-history > header {
  @apply mb-3 px-1;
}
.workout-history > header h2 {
  @apply mt-1 text-xl text-slate-950;
}
.history-list {
  @apply overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm;
}
.history-list > a {
  @apply flex min-h-16 items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 transition last:border-b-0 hover:text-indigo-700;
}
.history-list > a > span {
  @apply min-w-0;
}
.history-list strong,
.history-list small {
  @apply block truncate;
}
.history-list strong {
  @apply text-sm font-semibold text-slate-950;
}
.history-list small {
  @apply mt-1 flex items-center gap-1.5 text-xs text-slate-500;
}
.history-list small svg {
  @apply size-4 shrink-0;
}
.history-list > a > svg {
  @apply size-5 shrink-0 text-slate-400;
}
.history-status,
.history-error,
.history-empty,
.history-end {
  @apply mt-3 flex min-h-14 items-center justify-center gap-2 rounded-xl px-4 text-center text-xs text-slate-500;
}
.history-error {
  @apply justify-between border border-red-100 bg-red-50 text-left text-red-700;
}
.history-error button {
  @apply min-h-9 shrink-0 rounded-lg bg-white px-3 font-semibold text-red-700;
}
.history-empty {
  @apply border border-dashed border-slate-300 bg-white;
}
.history-end {
  @apply text-slate-600;
}
.history-end svg {
  @apply size-4 text-emerald-600;
}
.history-spinner {
  @apply size-4 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600;
}
.history-sentinel {
  @apply h-px;
}
</style>
