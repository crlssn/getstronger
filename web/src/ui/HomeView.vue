<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { DateTime } from 'luxon'
import {
  ArrowTrendingUpIcon,
  Battery50Icon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  FireIcon,
  ListBulletIcon,
  PlayIcon,
  TrophyIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'

import { useDashboardStore } from '@/stores/dashboard'
import { useWorkoutStore } from '@/stores/workout'
import { formatToRelativeDateTime } from '@/utils/datetime'

const dashboardStore = useDashboardStore()
const workoutStore = useWorkoutStore()
const routinePickerOpen = ref(false)

onMounted(async () => {
  await dashboardStore.load()
})

const dashboard = computed(() => dashboardStore.dashboard)
const nextRoutine = computed(() => dashboardStore.nextRoutine)
const activeWorkout = computed(() => {
  const activeWorkouts = Object.entries(workoutStore.workouts)
    .filter(([, workout]) => workout.startedAt)
    .sort(
      ([, first], [, second]) =>
        Date.parse(second.startedAt ?? '') - Date.parse(first.startedAt ?? ''),
    )
  const currentWorkout = activeWorkouts[0]
  if (!currentWorkout) return undefined

  const [routineId, workout] = currentWorkout
  return {
    routine: dashboard.value?.routines.find((routine) => routine.id === routineId),
    routineId,
    startedAt: workout.startedAt,
  }
})
const weeklyGoal = 4

const greeting = computed(() => {
  const hour = DateTime.now().hour
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})

const dateLabel = computed(() => DateTime.now().toFormat('EEEE, d LLLL'))
const estimatedMinutes = computed(() => Math.max(30, (nextRoutine.value?.exercises.length ?? 0) * 8))
const activeWorkoutStarted = computed(() => {
  if (!activeWorkout.value?.startedAt) return 'Workout in progress'
  const startedAt = DateTime.fromISO(activeWorkout.value.startedAt)
  if (!startedAt.isValid) return 'Workout in progress'
  return `Started ${startedAt.toRelative()}`
})
const weeklyProgress = computed(() =>
  Math.min(100, ((dashboard.value?.workoutsThisWeek ?? 0) / weeklyGoal) * 100),
)

const selectRoutine = async (routineId: string) => {
  await dashboardStore.selectRoutine(routineId)
  routinePickerOpen.value = false
}

const formatWeight = (weight: number | undefined) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(weight ?? 0)

const formatVolume = (volume: number | undefined) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(volume ?? 0)

const workoutDuration = (startedAt: { seconds: bigint } | undefined, finishedAt: { seconds: bigint } | undefined) => {
  if (!startedAt || !finishedAt) return ''
  const minutes = Math.max(1, Math.round(Number(finishedAt.seconds - startedAt.seconds) / 60))
  return `${minutes} min`
}
</script>

<template>
  <div class="dashboard-stack">
    <section class="welcome-row">
      <div>
        <p class="eyebrow">{{ dateLabel }}</p>
        <h1>{{ greeting }}</h1>
      </div>
      <span class="readiness-pill"><Battery50Icon /> Ready to train</span>
    </section>

    <section v-if="dashboardStore.loading && !dashboard" class="loading-card">
      <div class="loading-line w-32"></div>
      <div class="loading-line w-52"></div>
      <div class="loading-line w-full"></div>
    </section>

    <section v-else-if="activeWorkout" class="active-session">
      <div class="session-copy">
        <p class="eyebrow">Active workout</p>
        <h2>{{ activeWorkout.routine?.name ?? 'Workout in progress' }}</h2>
        <p class="active-meta"><ClockIcon /> {{ activeWorkoutStarted }}</p>
      </div>
      <RouterLink :to="`/workouts/routine/${activeWorkout.routineId}`" class="resume-button">
        Resume workout <ChevronRightIcon />
      </RouterLink>
    </section>

    <section v-else-if="nextRoutine" class="next-session">
      <div class="session-copy">
        <p class="eyebrow text-indigo-100">Up next</p>
        <h2>{{ nextRoutine.name }}</h2>
        <p class="session-meta">
          {{ nextRoutine.exercises.length }} exercises
          <span aria-hidden="true">•</span>
          About {{ estimatedMinutes }} min
        </p>
      </div>
      <div class="session-actions">
        <RouterLink :to="`/workouts/routine/${nextRoutine.id}`" class="start-button">
          <PlayIcon /> Start workout
        </RouterLink>
        <button type="button" class="choose-button" @click="routinePickerOpen = true">
          <ListBulletIcon /> Choose routine
        </button>
      </div>
    </section>

    <section v-else class="empty-card">
      <div class="empty-icon"><ListBulletIcon /></div>
      <div>
        <h2>Create your first routine</h2>
        <p>Build a repeatable workout to start tracking your progress.</p>
      </div>
      <RouterLink to="/routines/create" class="primary-link">Create routine</RouterLink>
    </section>

    <section class="metric-grid">
      <article class="metric-card">
        <div class="metric-heading">
          <span>This week</span>
          <strong>{{ dashboard?.workoutsThisWeek ?? 0 }} of {{ weeklyGoal }}</strong>
        </div>
        <div class="progress-track" aria-label="Weekly workout progress">
          <div class="progress-fill" :style="{ width: `${weeklyProgress}%` }"></div>
        </div>
        <p>{{ weeklyGoal - (dashboard?.workoutsThisWeek ?? 0) > 0 ? `${weeklyGoal - (dashboard?.workoutsThisWeek ?? 0)} sessions to go` : 'Weekly goal complete' }}</p>
      </article>
      <article class="metric-card">
        <div class="metric-heading">
          <span>Weekly volume</span>
          <ArrowTrendingUpIcon class="metric-icon" />
        </div>
        <strong class="metric-value">{{ formatVolume(dashboard?.volumeThisWeek) }} kg</strong>
        <p>Across completed workouts</p>
      </article>
    </section>

    <section v-if="dashboard?.personalBests.length" class="section-block">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Momentum</p>
          <h2>Personal bests</h2>
        </div>
        <RouterLink to="/progress">See progress <ChevronRightIcon /></RouterLink>
      </div>
      <div class="highlight-list">
        <article v-for="personalBest in dashboard.personalBests.slice(0, 3)" :key="personalBest.set?.id" class="highlight-row">
          <span class="highlight-icon"><TrophyIcon /></span>
          <div class="min-w-0">
            <strong>{{ personalBest.exercise?.name }}</strong>
            <p>{{ formatWeight(personalBest.set?.weight) }} kg × {{ personalBest.set?.reps }}</p>
          </div>
          <span class="pr-pill">PR</span>
        </article>
      </div>
    </section>

    <section v-if="dashboard?.recentWorkouts.length" class="section-block">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Your training</p>
          <h2>Recent workouts</h2>
        </div>
      </div>
      <div class="workout-list">
        <RouterLink
          v-for="workout in dashboard.recentWorkouts"
          :key="workout.id"
          :to="`/workouts/${workout.id}`"
          class="workout-row"
        >
          <span class="workout-icon"><FireIcon /></span>
          <div class="min-w-0">
            <strong>{{ workout.name }}</strong>
            <p>
              {{ workout.exerciseSets.length }} exercises
              <span aria-hidden="true">•</span>
              {{ workoutDuration(workout.startedAt, workout.finishedAt) }}
              <span aria-hidden="true">•</span>
              {{ formatToRelativeDateTime(workout.finishedAt) }}
            </p>
          </div>
          <span class="volume-label">{{ formatVolume(workout.intensity) }} kg</span>
        </RouterLink>
      </div>
    </section>
  </div>

  <div v-if="routinePickerOpen" class="picker-backdrop" @click.self="routinePickerOpen = false">
    <section class="routine-picker" role="dialog" aria-modal="true" aria-labelledby="routine-picker-title">
      <header>
        <div>
          <p class="eyebrow">Change what is up next</p>
          <h2 id="routine-picker-title">Choose routine</h2>
        </div>
        <button type="button" aria-label="Close routine picker" @click="routinePickerOpen = false"><XMarkIcon /></button>
      </header>
      <div class="routine-options">
        <button
          v-for="routine in dashboard?.routines"
          :key="routine.id"
          type="button"
          :class="{ selected: routine.id === nextRoutine?.id }"
          @click="selectRoutine(routine.id)"
        >
          <span class="routine-icon"><FireIcon /></span>
          <span class="min-w-0">
            <strong>{{ routine.name }}</strong>
            <small>{{ routine.exercises.length }} exercises</small>
          </span>
          <span class="selection-icon"><CheckIcon /></span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dashboard-stack { @apply space-y-5; }
.welcome-row { @apply flex items-center justify-between gap-4 px-1; }
.eyebrow { @apply text-xs font-semibold uppercase tracking-wider text-slate-500; }
h1 { @apply mt-1 text-2xl font-semibold tracking-tight text-slate-950; }
h2 { @apply text-xl font-semibold tracking-tight text-slate-950; }
.readiness-pill { @apply hidden sm:inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700; }
.readiness-pill svg { @apply size-5; }
.active-session { @apply grid gap-5 rounded-3xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm sm:grid-cols-[1fr_auto] sm:items-end sm:p-7; }
.active-session h2 { @apply mt-1 text-2xl; }
.active-meta { @apply mt-2 flex items-center gap-2 text-sm text-indigo-700; }
.active-meta svg { @apply size-4; }
.resume-button { @apply inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700; }
.resume-button svg { @apply size-5; }
.next-session { @apply grid gap-5 rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-5 text-white shadow-lg shadow-indigo-200 sm:grid-cols-[1fr_auto] sm:items-end sm:p-7; }
.next-session h2 { @apply mt-1 text-2xl text-white; }
.session-meta { @apply mt-2 flex flex-wrap items-center gap-2 text-sm text-indigo-100; }
.session-actions { @apply grid gap-2 sm:min-w-48; }
.start-button, .choose-button { @apply inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition; }
.start-button { @apply bg-white text-indigo-700 hover:bg-indigo-50; }
.choose-button { @apply border border-white/40 bg-white/10 text-white hover:bg-white/20; }
.start-button svg, .choose-button svg { @apply size-5; }
.metric-grid { @apply grid gap-4 sm:grid-cols-2; }
.metric-card, .section-block, .empty-card, .loading-card { @apply rounded-2xl border border-slate-200 bg-white p-5 shadow-sm; }
.metric-card { @apply space-y-3; }
.metric-heading { @apply flex items-center justify-between gap-3 text-sm text-slate-500; }
.metric-heading strong { @apply text-slate-900; }
.metric-icon { @apply size-5 text-indigo-600; }
.metric-value { @apply block text-2xl font-semibold tracking-tight text-slate-950; }
.metric-card p { @apply text-sm text-slate-500; }
.progress-track { @apply h-2 overflow-hidden rounded-full bg-slate-100; }
.progress-fill { @apply h-full rounded-full bg-indigo-600 transition-all; }
.section-heading { @apply mb-4 flex items-end justify-between gap-3; }
.section-heading a { @apply inline-flex items-center gap-1 text-sm font-semibold text-indigo-600; }
.section-heading a svg { @apply size-4; }
.highlight-list, .workout-list { @apply divide-y divide-slate-100; }
.highlight-row, .workout-row { @apply grid grid-cols-[auto_1fr_auto] items-center gap-3 py-4 first:pt-0 last:pb-0; }
.workout-row { @apply transition hover:text-indigo-700; }
.highlight-row p, .workout-row p { @apply mt-0.5 truncate text-sm text-slate-500; }
.highlight-icon, .workout-icon, .routine-icon { @apply grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600; }
.highlight-icon svg, .workout-icon svg, .routine-icon svg { @apply size-5; }
.pr-pill { @apply rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700; }
.volume-label { @apply text-sm font-semibold text-slate-700; }
.empty-card { @apply grid justify-items-start gap-4; }
.empty-icon { @apply grid size-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600; }
.empty-icon svg { @apply size-6; }
.empty-card p { @apply mt-1 text-sm text-slate-500; }
.primary-link { @apply inline-flex min-h-11 items-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white; }
.loading-card { @apply space-y-4; }
.loading-line { @apply h-4 animate-pulse rounded-full bg-slate-100; }
.picker-backdrop { @apply fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-6; }
.routine-picker { @apply w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl; }
.routine-picker header { @apply mb-5 flex items-center justify-between gap-4; }
.routine-picker header button { @apply grid size-11 place-items-center rounded-xl border border-slate-200 text-slate-500; }
.routine-picker header button svg { @apply size-5; }
.routine-options { @apply space-y-2; }
.routine-options > button { @apply grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-slate-200 p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/50; }
.routine-options > button.selected { @apply border-indigo-500 bg-indigo-50; }
.routine-options strong, .routine-options small { @apply block truncate; }
.routine-options small { @apply mt-1 text-sm text-slate-500; }
.selection-icon { @apply grid size-8 place-items-center rounded-full bg-slate-100 text-transparent; }
.selection-icon svg { @apply size-4; }
.routine-options > button.selected .selection-icon { @apply bg-indigo-600 text-white; }
</style>
