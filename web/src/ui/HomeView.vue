<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { DateTime } from 'luxon'
import { useIntersectionObserver } from '@vueuse/core'
import {
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  FireIcon,
  ListBulletIcon,
  PlayIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'

import { useDashboardStore } from '@/stores/dashboard'
import { listFeedItems } from '@/http/requests'
import type { Workout } from '@/proto/api/v1/workout_service_pb'
import useActiveWorkout from '@/utils/useActiveWorkout'
import CardWorkout from '@/ui/components/CardWorkout.vue'
import HomePageActions from '@/ui/components/HomePageActions.vue'
import StreakCard from '@/ui/components/StreakCard.vue'
import { dateLocale } from '@/i18n'

const { t } = useI18n()

const dashboardStore = useDashboardStore()
const { discardSavedWorkout, savedHref, savedRoutineName, savedWorkout, savedWorkoutStarted } =
  useActiveWorkout()
const searchOpen = ref(false)
const routinePickerOpen = ref(false)
const followedWorkouts = ref<Workout[]>([])
const feedPageToken = ref<Uint8Array>(new Uint8Array(0))
const feedSentinel = ref<HTMLElement | null>(null)
const feedLoading = ref(false)
const feedInitiallyLoaded = ref(false)
const feedReachedEnd = ref(false)
const feedError = ref(false)

const loadMoreFeed = async () => {
  if (feedLoading.value || feedReachedEnd.value) return

  feedLoading.value = true
  feedError.value = false
  const feed = await listFeedItems(feedPageToken.value, true)
  feedInitiallyLoaded.value = true

  if (!feed) {
    feedError.value = true
    feedLoading.value = false
    return
  }

  const existingWorkoutIds = new Set(followedWorkouts.value.map((workout) => workout.id))
  const workouts: Workout[] = []
  for (const item of feed.items) {
    if (item.type.case !== 'workout' || existingWorkoutIds.has(item.type.value.id)) continue
    existingWorkoutIds.add(item.type.value.id)
    workouts.push(item.type.value)
  }
  followedWorkouts.value = [...followedWorkouts.value, ...workouts]

  const nextPageToken = feed.pagination?.nextPageToken ?? new Uint8Array(0)
  feedPageToken.value = nextPageToken
  feedReachedEnd.value = nextPageToken.length === 0
  feedLoading.value = false

  await nextTick()
  const sentinelTop = feedSentinel.value?.getBoundingClientRect().top
  if (
    sentinelTop !== undefined &&
    sentinelTop <= window.innerHeight + 500 &&
    !feedReachedEnd.value
  ) {
    void loadMoreFeed()
  }
}

useIntersectionObserver(
  feedSentinel,
  ([entry]) => {
    if (entry?.isIntersecting) void loadMoreFeed()
  },
  { rootMargin: '500px 0px' },
)

onMounted(async () => {
  await Promise.all([dashboardStore.load(), loadMoreFeed()])
})

const dashboard = computed(() => dashboardStore.dashboard)
const nextRoutine = computed(() => dashboardStore.nextRoutine)
const activePlan = computed(() => dashboardStore.activePlan)
const nextWorkoutTarget = computed(() =>
  nextRoutine.value
    ? {
        path: `/workouts/routine/${nextRoutine.value.id}`,
        query: activePlan.value ? { plan_id: activePlan.value.id } : {},
      }
    : '/workout',
)
const greeting = computed(() => {
  const hour = DateTime.now().hour
  if (hour < 12) return t('home.morning')
  if (hour < 18) return t('home.afternoon')
  return t('home.evening')
})

const dateLabel = computed(() => DateTime.now().setLocale(dateLocale).toFormat('EEEE, d LLLL'))
const estimatedMinutes = computed(() =>
  Math.max(30, (nextRoutine.value?.exercises.length ?? 0) * 8),
)
const selectRoutine = async (routineId: string) => {
  await dashboardStore.selectRoutine(routineId)
  routinePickerOpen.value = false
}
</script>

<template>
  <div class="dashboard-stack">
    <section class="welcome-row" :class="{ searching: searchOpen }">
      <div v-if="!searchOpen">
        <p class="eyebrow">{{ dateLabel }}</p>
        <h1>{{ greeting }}</h1>
      </div>
      <HomePageActions v-model:open="searchOpen" />
    </section>

    <template v-if="!searchOpen">
      <StreakCard />

      <section v-if="savedWorkout" class="active-session">
        <div>
          <p class="eyebrow">{{ $t('home.activeWorkout') }}</p>
          <h2>{{ savedRoutineName }}</h2>
          <p class="active-meta"><ClockIcon /> {{ savedWorkoutStarted }}</p>
        </div>
        <div class="active-actions">
          <RouterLink :to="savedHref"
            >{{ $t('home.resumeWorkout') }} <ChevronRightIcon
          /></RouterLink>
          <button type="button" @click="discardSavedWorkout">
            <TrashIcon /> {{ $t('home.discardWorkout') }}
          </button>
        </div>
      </section>

      <section v-else-if="dashboardStore.loading && !dashboard" class="loading-card">
        <div class="loading-line w-32"></div>
        <div class="loading-line w-52"></div>
        <div class="loading-line w-full"></div>
      </section>

      <section v-else-if="nextRoutine" class="next-session">
        <div class="session-copy">
          <div class="next-label-row">
            <p class="eyebrow">{{ $t('home.upNext') }}</p>
            <span v-if="activePlan" class="plan-progress"
              >{{ activePlan.currentPosition + 1 }} {{ $t('common.of') }}
              {{ activePlan.routines.length }}</span
            >
            <span v-else class="ready-status"><CheckIcon /> {{ $t('home.ready') }}</span>
          </div>
          <h2>{{ nextRoutine.name }}</h2>
          <p v-if="activePlan" class="plan-source">{{ activePlan.name }}</p>
          <p class="session-meta">
            {{ $t('home.exerciseCount', nextRoutine.exercises.length) }}
            <span aria-hidden="true">•</span>
            {{ $t('home.aboutMinutes', { count: estimatedMinutes }) }}
          </p>
        </div>
        <div class="session-actions">
          <RouterLink :to="nextWorkoutTarget" class="start-button">
            <PlayIcon /> {{ $t('home.startWorkout') }}
          </RouterLink>
          <RouterLink v-if="activePlan" to="/workout" class="choose-button">{{
            $t('home.workoutOptions')
          }}</RouterLink>
          <button v-else type="button" class="choose-button" @click="routinePickerOpen = true">
            {{ $t('home.chooseRoutine') }}
          </button>
        </div>
      </section>

      <section v-else class="empty-card">
        <div class="empty-icon"><ListBulletIcon /></div>
        <div>
          <h2>{{ $t('home.createFirstRoutine') }}</h2>
          <p>{{ $t('home.createFirstRoutineBody') }}</p>
        </div>
        <RouterLink to="/routines/create" class="primary-link">{{
          $t('home.createRoutine')
        }}</RouterLink>
      </section>

      <section class="following-feed">
        <header>
          <p class="eyebrow">{{ $t('home.following') }}</p>
          <h2>{{ $t('home.latestWorkouts') }}</h2>
        </header>
        <CardWorkout
          v-for="workout in followedWorkouts"
          :key="workout.id"
          compact
          :workout="workout"
        />
        <div v-if="!feedInitiallyLoaded" class="feed-status" aria-live="polite">
          <span class="feed-spinner"></span> {{ $t('home.loadingLatest') }}
        </div>
        <div v-else-if="feedError" class="feed-error" role="alert">
          <span>{{ $t('home.loadFailed') }}</span>
          <button type="button" @click="loadMoreFeed">{{ $t('common.retry') }}</button>
        </div>
        <div v-else-if="!followedWorkouts.length" class="feed-empty">
          {{ $t('home.emptyFeed') }}
        </div>
        <div v-else-if="feedLoading" class="feed-status" aria-live="polite">
          <span class="feed-spinner"></span> {{ $t('home.loadingMore') }}
        </div>
        <div v-else-if="feedReachedEnd" class="feed-end" role="status">
          <span><CheckIcon /></span>
          <div>
            <strong>{{ $t('home.caughtUp') }}</strong
            ><small>{{ $t('home.reachedEnd') }}</small>
          </div>
        </div>
        <div ref="feedSentinel" class="feed-sentinel" aria-hidden="true"></div>
      </section>
    </template>
  </div>

  <div v-if="routinePickerOpen" class="picker-backdrop" @click.self="routinePickerOpen = false">
    <section
      class="routine-picker"
      role="dialog"
      aria-modal="true"
      aria-labelledby="routine-picker-title"
    >
      <header>
        <div>
          <p class="eyebrow">{{ $t('home.changeNext') }}</p>
          <h2 id="routine-picker-title">{{ $t('home.chooseRoutine') }}</h2>
        </div>
        <button
          type="button"
          :aria-label="$t('home.closePicker')"
          @click="routinePickerOpen = false"
        >
          <XMarkIcon />
        </button>
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
            <small>{{ $t('home.exerciseCount', routine.exercises.length) }}</small>
          </span>
          <span class="selection-icon"><CheckIcon /></span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
@reference '../assets/base.css';

.dashboard-stack {
  @apply space-y-5;
}
.welcome-row {
  @apply flex items-start justify-between gap-4 px-1;
}
.welcome-row.searching {
  @apply block;
}
.eyebrow {
  @apply text-xs font-semibold uppercase tracking-wider text-slate-600;
}
h1 {
  @apply mt-1 text-2xl font-semibold tracking-tight text-slate-950;
}
h2 {
  @apply text-xl font-semibold tracking-tight text-slate-950;
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
.active-actions > button {
  @apply inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold text-stone-500 transition hover:bg-stone-200/70 hover:text-red-600;
}
.active-actions svg {
  @apply size-5;
}
.active-actions > button svg {
  @apply size-4;
}
.next-session {
  @apply grid gap-5 rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-5 text-white shadow-lg shadow-indigo-200 sm:grid-cols-[1fr_auto] sm:items-end sm:p-6;
}
.next-label-row {
  @apply flex items-center justify-between gap-3;
}
.next-session .eyebrow {
  @apply text-indigo-100;
}
.next-label-row .plan-progress {
  @apply rounded-full border border-white/20 bg-white/15 px-3 py-1 text-xs font-semibold text-white;
}
.next-label-row .ready-status {
  @apply inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold text-white;
}
.ready-status svg {
  @apply size-3.5;
}
.next-session h2 {
  @apply mt-1 text-2xl text-white;
}
.session-meta {
  @apply mt-2 flex flex-wrap items-center gap-2 text-sm text-indigo-100;
}
.plan-source {
  @apply mt-1 text-sm font-semibold text-white;
}
.session-actions {
  @apply grid gap-1 sm:min-w-48;
}
.start-button,
.choose-button {
  @apply inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition;
}
.start-button {
  @apply bg-white text-indigo-700 hover:bg-indigo-50;
}
.choose-button {
  @apply text-white hover:bg-white/10;
}
.start-button svg,
.choose-button svg {
  @apply size-5;
}
.section-block,
.empty-card,
.loading-card {
  @apply rounded-2xl border border-slate-200 bg-white p-5 shadow-sm;
}
.section-heading {
  @apply mb-4 flex items-end justify-between gap-3;
}
.section-heading a {
  @apply inline-flex items-center gap-1 text-sm font-semibold text-indigo-600;
}
.section-heading a svg {
  @apply size-4;
}
.following-feed {
  @apply pt-1;
}
.following-feed > header {
  @apply mb-3 px-1;
}
.following-feed > header h2 {
  @apply mt-1;
}
.feed-empty {
  @apply rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500;
}
.feed-status {
  @apply flex min-h-14 items-center justify-center gap-3 text-sm font-medium text-slate-500;
}
.feed-spinner {
  @apply size-5 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600;
}
.feed-error {
  @apply flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 text-sm text-red-700;
}
.feed-error button {
  @apply min-h-10 shrink-0 rounded-xl px-3 font-semibold hover:bg-red-100;
}
.feed-end {
  @apply flex items-center justify-center gap-3 py-5 text-slate-600;
}
.feed-end > span {
  @apply grid size-9 place-items-center rounded-full bg-emerald-50 text-emerald-700;
}
.feed-end svg {
  @apply size-5;
}
.feed-end strong,
.feed-end small {
  @apply block;
}
.feed-end strong {
  @apply text-sm font-semibold text-slate-700;
}
.feed-end small {
  @apply mt-0.5 text-xs;
}
.feed-sentinel {
  @apply h-px;
}
.momentum-grid {
  @apply grid grid-cols-3 divide-x divide-slate-200;
}
.momentum-grid > div {
  @apply grid gap-1 px-3 first:pl-0 last:pr-0;
}
.momentum-grid strong {
  @apply text-sm font-semibold text-slate-950 sm:text-base;
}
.momentum-grid small {
  @apply text-xs text-slate-500;
}
.last-session-block .section-heading {
  @apply items-center;
}
.last-session-block .section-heading > span {
  @apply text-xs text-slate-500;
}
.last-session-row {
  @apply grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-slate-100 pt-4 transition hover:text-indigo-700;
}
.last-session-row small {
  @apply mt-1 block text-sm text-slate-500;
}
.last-session-row > svg {
  @apply size-5 text-slate-400;
}
.workout-icon,
.routine-icon {
  @apply grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600;
}
.workout-icon svg,
.routine-icon svg {
  @apply size-5;
}
.empty-card {
  @apply grid justify-items-start gap-4 border-transparent bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-lg shadow-indigo-200;
}
.empty-card h2 {
  @apply text-white;
}
.empty-icon {
  @apply grid size-12 place-items-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20;
}
.empty-icon svg {
  @apply size-6;
}
.empty-card p {
  @apply mt-1 text-sm text-indigo-100;
}
.primary-link {
  @apply inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50;
}
.loading-card {
  @apply space-y-4;
}
.loading-line {
  @apply h-4 animate-pulse rounded-full bg-slate-100;
}
.picker-backdrop {
  @apply fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-6;
}
.routine-picker {
  @apply flex max-h-[75vh] w-full max-w-lg flex-col rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl;
}
.routine-picker header {
  @apply mb-5 flex items-center justify-between gap-4;
}
.routine-picker header button {
  @apply grid size-11 place-items-center rounded-xl border border-slate-200 text-slate-500;
}
.routine-picker header button svg {
  @apply size-5;
}
.routine-options {
  @apply min-h-0 flex-1 space-y-2 overflow-y-auto;
}
.routine-options > button {
  @apply grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-slate-200 p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/50;
}
.routine-options > button.selected {
  @apply border-indigo-500 bg-indigo-50;
}
.routine-options strong,
.routine-options small {
  @apply block truncate;
}
.routine-options small {
  @apply mt-1 text-sm text-slate-500;
}
.selection-icon {
  @apply grid size-8 place-items-center rounded-full bg-slate-100 text-transparent;
}
.selection-icon svg {
  @apply size-4;
}
.routine-options > button.selected .selection-icon {
  @apply bg-indigo-600 text-white;
}
</style>
