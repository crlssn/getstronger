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
  UsersIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'

import { useDashboardStore } from '@/stores/dashboard'
import { listFeedItems } from '@/http/requests'
import type { Workout } from '@/proto/api/v1/workout_service_pb'
import useActiveWorkout from '@/utils/useActiveWorkout'
import CardWorkout from '@/ui/components/CardWorkout.vue'
import AppEmptyState from '@/ui/components/AppEmptyState.vue'
import AppSheet from '@/ui/components/AppSheet.vue'
import AppSkeleton from '@/ui/components/AppSkeleton.vue'
import HomePageActions from '@/ui/components/HomePageActions.vue'
import StreakCard from '@/ui/components/StreakCard.vue'
import { dateLocale } from '@/i18n'

const { t } = useI18n()

const dashboardStore = useDashboardStore()
const { discardSavedWorkout, savedHref, savedRoutineName, savedWorkout, savedWorkoutStarted } =
  useActiveWorkout()
const searchOpen = ref(false)
const openSearch = () => (searchOpen.value = true)
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

      <AppSkeleton v-else-if="dashboardStore.loading && !dashboard" />

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

      <AppEmptyState
        v-else
        :action="{ label: $t('home.createRoutine'), to: '/routines/create' }"
        :body="$t('home.createFirstRoutineBody')"
        :title="$t('home.createFirstRoutine')"
      >
        <template #icon><ListBulletIcon /></template>
      </AppEmptyState>

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
        <AppSkeleton v-if="!feedInitiallyLoaded" />
        <div v-else-if="feedError" class="feed-error" role="alert">
          <span>{{ $t('home.loadFailed') }}</span>
          <button type="button" @click="loadMoreFeed">{{ $t('common.retry') }}</button>
        </div>
        <AppEmptyState
          v-else-if="!followedWorkouts.length"
          :action="{ label: $t('home.emptyFeedAction') }"
          :body="$t('home.emptyFeed')"
          :title="$t('home.emptyFeedTitle')"
          @action="openSearch"
        >
          <template #icon><UsersIcon /></template>
        </AppEmptyState>
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

  <AppSheet
    v-if="routinePickerOpen"
    :eyebrow="$t('home.changeNext')"
    :title="$t('home.chooseRoutine')"
    :close-label="$t('home.closePicker')"
    @close="routinePickerOpen = false"
  >
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
  </AppSheet>
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
  @apply text-eyebrow font-bold uppercase text-text-subtle;
}
h1 {
  @apply mt-1 text-display font-bold text-text;
}
h2 {
  @apply text-title font-semibold text-text;
}
.active-session {
  @apply grid gap-5 rounded-card border border-ink-border bg-ink-surface p-5 shadow-card sm:grid-cols-[1fr_auto] sm:items-end sm:p-6;
}
.active-session h2 {
  @apply mt-1;
}
.active-meta {
  @apply mt-3 flex items-center gap-2 text-sm text-text-muted;
}
.active-meta svg {
  @apply size-4;
}
.active-actions {
  @apply grid gap-1 sm:min-w-48;
}
.active-actions > a {
  @apply inline-flex min-h-(--size-control) items-center justify-center gap-2 rounded-control bg-surface-inverse px-5 text-sm font-semibold text-white transition hover:bg-ink-strong;
}
.active-actions > button {
  @apply inline-flex min-h-(--size-control) items-center justify-center gap-2 rounded-control px-5 text-sm font-semibold text-text-subtle transition hover:bg-ink-tint/70 hover:text-danger;
}
.active-actions svg {
  @apply size-5;
}
.active-actions > button svg {
  @apply size-4;
}
.next-session {
  @apply grid gap-5 rounded-sheet bg-surface-inverse p-5 text-white shadow-raised sm:grid-cols-[1fr_auto] sm:items-end sm:p-6;
}
.next-label-row {
  @apply flex items-center justify-between gap-3;
}
.next-session .eyebrow {
  @apply text-ink-tint;
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
  @apply mt-1 text-display font-bold text-white;
}
.session-meta {
  @apply mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-tint;
}
.plan-source {
  @apply mt-1 text-sm font-semibold text-white;
}
.session-actions {
  @apply grid gap-1 sm:min-w-48;
}
.start-button,
.choose-button {
  @apply inline-flex min-h-(--size-control) items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold transition;
}
.start-button {
  @apply bg-white text-ink-strong hover:bg-ink-surface;
}
.choose-button {
  @apply text-white hover:bg-white/10;
}
.start-button svg,
.choose-button svg {
  @apply size-5;
}
.section-block {
  @apply card p-5;
}
.section-heading {
  @apply mb-4 flex items-end justify-between gap-3;
}
.section-heading a {
  @apply inline-flex items-center gap-1 text-sm font-semibold text-ink;
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
.feed-status {
  @apply flex min-h-14 items-center justify-center gap-3 text-sm font-medium text-text-subtle;
}
.feed-spinner {
  @apply size-5 animate-spin rounded-full border-2 border-border border-t-ink;
}
.feed-error {
  @apply flex min-h-14 items-center justify-between gap-3 rounded-card border border-danger/20 bg-danger-surface px-4 text-sm text-danger;
}
.feed-error button {
  @apply min-h-(--size-control-sm) shrink-0 rounded-control px-3 font-semibold hover:bg-danger-surface hover:text-danger-strong;
}
.feed-end {
  @apply flex items-center justify-center gap-3 py-5 text-text-muted;
}
.feed-end > span {
  @apply grid size-9 place-items-center rounded-full bg-success-surface text-success;
}
.feed-end svg {
  @apply size-5;
}
.feed-end strong,
.feed-end small {
  @apply block;
}
.feed-end strong {
  @apply text-sm font-semibold text-text-muted;
}
.feed-end small {
  @apply mt-0.5 text-xs;
}
.feed-sentinel {
  @apply h-px;
}
.momentum-grid {
  @apply grid grid-cols-3 divide-x divide-border;
}
.momentum-grid > div {
  @apply grid gap-1 px-3 first:pl-0 last:pr-0;
}
.momentum-grid strong {
  @apply text-sm font-semibold text-text sm:text-base;
}
.momentum-grid small {
  @apply text-xs text-text-subtle;
}
.last-session-block .section-heading {
  @apply items-center;
}
.last-session-block .section-heading > span {
  @apply text-xs text-text-subtle;
}
.last-session-row {
  @apply grid grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-border pt-4 transition hover:text-ink-strong;
}
.last-session-row small {
  @apply mt-1 block text-sm text-text-subtle;
}
.last-session-row > svg {
  @apply size-5 text-text-subtle;
}
.workout-icon,
.routine-icon {
  @apply grid size-11 place-items-center rounded-control bg-ink-surface text-ink;
}
.workout-icon svg,
.routine-icon svg {
  @apply size-5;
}
.routine-options {
  @apply space-y-2;
}
.routine-options > button {
  @apply grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-card border border-border p-4 text-left hover:border-ink-border hover:bg-ink-surface/50;
}
.routine-options > button.selected {
  @apply border-ink-muted bg-ink-surface;
}
.routine-options strong,
.routine-options small {
  @apply block truncate;
}
.routine-options small {
  @apply mt-1 text-sm text-text-subtle;
}
.selection-icon {
  @apply grid size-8 place-items-center rounded-full bg-ink-tint text-transparent;
}
.selection-icon svg {
  @apply size-4;
}
.routine-options > button.selected .selection-icon {
  @apply bg-ink text-white;
}
</style>
