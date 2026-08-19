<script setup lang="ts">
import type { Workout } from '@/proto/api/v1/workout_service_pb'

import { useIntersectionObserver } from '@vueuse/core'
import {
  BoltIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  PlayIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { listWorkouts } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import { usePlanStore } from '@/stores/plans'
import { formatToShortDateTime } from '@/utils/datetime'
import { formatNumber } from '@/utils/numbers'
import { i18n } from '@/i18n'
import useActiveWorkout from '@/utils/useActiveWorkout'

// The row earns its space with the stats that matter: date, volume, duration.
const workoutMeta = (workout: Workout) => {
  const parts = [formatToShortDateTime(workout.finishedAt)]
  if (workout.intensity > 0) {
    parts.push(`${formatNumber(workout.intensity)} ${i18n.global.t('common.kg')}`)
  }
  if (workout.startedAt && workout.finishedAt) {
    const minutes = Math.max(
      1,
      Math.round(Number(workout.finishedAt.seconds - workout.startedAt.seconds) / 60),
    )
    parts.push(`${minutes} ${i18n.global.t('common.min')}`)
  }
  return parts.join(' · ')
}

const authStore = useAuthStore()
const { t } = useI18n()
const dashboardStore = useDashboardStore()
const planStore = usePlanStore()
const { discardSavedWorkout, savedHref, savedRoutineName, savedWorkout, savedWorkoutStarted } =
  useActiveWorkout()
const previousWorkouts = ref<Workout[]>([])
const historyPageToken = ref<Uint8Array>(new Uint8Array(0))
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
  if (!confirm(t('workout.skipConfirm', { name: nextRoutine.value.name }))) return
  if (await planStore.skip(activePlan.value.id)) await dashboardStore.load()
}
</script>

<template>
  <div class="workout-page">
    <header class="page-intro">
      <h1>{{ t('workout.heading') }}</h1>
      <p>{{ t('workout.subtitle') }}</p>
    </header>
    <section v-if="savedWorkout" class="active-session">
      <div>
        <p class="eyebrow">{{ t('workout.active') }}</p>
        <h2>{{ savedRoutineName }}</h2>
        <p class="active-meta"><ClockIcon /> {{ savedWorkoutStarted }}</p>
      </div>
      <div class="active-actions">
        <RouterLink :to="savedHref">{{ t('workout.resume') }} <ChevronRightIcon /></RouterLink>
        <button type="button" @click="discardSavedWorkout">
          <TrashIcon /> {{ t('workout.discard') }}
        </button>
      </div>
    </section>
    <section v-else-if="nextRoutine" class="next-card">
      <header>
        <p class="eyebrow">{{ activePlan ? t('training.activePlan') : t('home.upNext') }}</p>
        <span v-if="activePlan"
          >{{ activePlan.currentPosition + 1 }} {{ t('common.of') }}
          {{ activePlan.routines.length }}</span
        >
      </header>
      <h2>{{ nextRoutine.name }}</h2>
      <p v-if="activePlan" class="plan-name">{{ activePlan.name }}</p>
      <p>
        {{ t('home.exerciseCount', { count: nextRoutine.exercises.length }) }} ·
        {{ t('home.aboutMinutes', { count: Math.max(30, nextRoutine.exercises.length * 8) }) }}
      </p>
      <RouterLink :to="plannedStart"><PlayIcon /> {{ t('workout.startRoutine') }}</RouterLink>
      <button v-if="activePlan" type="button" class="skip-button" @click="skip">
        {{ t('workout.skipRoutine') }}
      </button>
    </section>
    <section v-else-if="!savedWorkout" class="empty-card">
      <h2>{{ t('workout.noSelection') }}</h2>
      <p>{{ t('workout.noSelectionBody') }}</p>
      <RouterLink to="/plans">{{ t('home.chooseRoutine') }}</RouterLink>
    </section>
    <RouterLink to="/workouts/quick" class="quick-card"
      ><span class="quick-icon"><BoltIcon /></span
      ><span
        ><strong>{{ t('workout.quick') }}</strong
        ><small>{{ t('workout.quickBody') }}</small></span
      ><ChevronRightIcon
    /></RouterLink>

    <section class="workout-history">
      <header>
        <p class="eyebrow">{{ t('workout.history') }}</p>
        <h2>{{ t('workout.previous') }}</h2>
      </header>

      <div v-if="previousWorkouts.length" class="history-list">
        <RouterLink
          v-for="workout in previousWorkouts"
          :key="workout.id"
          :to="`/workouts/${workout.id}`"
        >
          <span>
            <strong>{{ workout.name }}</strong>
            <small>{{ workoutMeta(workout) }}</small>
          </span>
          <ChevronRightIcon />
        </RouterLink>
      </div>

      <div v-if="!historyInitiallyLoaded" class="history-status" aria-live="polite">
        <span class="history-spinner"></span> {{ t('workout.loadingHistory') }}
      </div>
      <div v-else-if="historyError" class="history-error" role="alert">
        <span>{{ t('workout.historyError') }}</span>
        <button type="button" @click="loadMoreHistory">{{ t('common.retry') }}</button>
      </div>
      <div v-else-if="!previousWorkouts.length" class="history-empty">
        {{ t('workout.historyEmpty') }}
      </div>
      <div v-else-if="historyLoading" class="history-status" aria-live="polite">
        <span class="history-spinner"></span> {{ t('workout.loadingMoreHistory') }}
      </div>
      <div v-else-if="historyReachedEnd" class="history-end" role="status">
        <CheckIcon /> {{ t('workout.historyEnd') }}
      </div>
      <div ref="historySentinel" class="history-sentinel" aria-hidden="true"></div>
    </section>
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.workout-page {
  @apply space-y-4;
}
.page-intro {
  @apply px-1;
}
.eyebrow {
  @apply text-eyebrow font-bold uppercase text-text-subtle;
}
h1 {
  @apply mt-1 text-display font-bold text-text;
}
h2 {
  @apply text-title font-semibold;
}
.page-intro > p:last-child {
  @apply mt-1 text-sm text-text-subtle;
}
.quick-card {
  @apply card grid grid-cols-[1fr_auto] items-center gap-3 p-4;
}
.quick-card > span:nth-child(2) {
  @apply min-w-0;
}
.quick-card strong,
.quick-card small {
  @apply block truncate;
}
.quick-card small {
  @apply mt-1 text-xs text-text-subtle;
}
.quick-card > svg {
  @apply size-5 text-text-subtle;
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
.active-actions > a svg {
  @apply size-5;
}
.active-actions > button {
  @apply inline-flex min-h-(--size-control) items-center justify-center gap-2 rounded-control px-5 text-sm font-semibold text-text-subtle transition hover:bg-ink-tint/70 hover:text-danger;
}
.active-actions > button svg {
  @apply size-4;
}
.next-card {
  @apply rounded-sheet bg-surface-inverse p-6 text-white shadow-raised;
}
.next-card > header {
  @apply flex items-center justify-between gap-3;
}
.next-card .eyebrow {
  @apply text-ink-tint;
}
.next-card > header span {
  @apply rounded-full border border-white/20 bg-white/15 px-3 py-1 text-xs font-semibold;
}
.next-card h2 {
  @apply mt-3 text-display font-bold;
}
.next-card > p {
  @apply mt-2 text-sm text-ink-tint;
}
.next-card .plan-name {
  @apply font-semibold text-white;
}
.next-card > a {
  @apply mt-5 flex min-h-(--size-control) items-center justify-center gap-2 rounded-control bg-white px-4 text-sm font-semibold text-ink-strong;
}
.next-card > a svg {
  @apply size-5;
}
.skip-button {
  @apply mt-2 min-h-(--size-control-sm) w-full text-sm font-semibold text-ink-tint;
}
.empty-card {
  @apply card p-5;
}
.empty-card p {
  @apply mt-1 text-sm text-text-subtle;
}
.empty-card a {
  @apply mt-4 inline-flex min-h-(--size-control) items-center rounded-control bg-ink px-4 text-sm font-semibold text-white;
}
.quick-card {
  @apply grid-cols-[3rem_1fr_auto];
}
.quick-icon {
  @apply grid size-12 place-items-center rounded-control bg-ink-tint text-ink-strong;
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
  @apply mt-1 text-text;
}
.history-list {
  @apply card overflow-hidden;
}
.history-list > a {
  @apply flex min-h-16 items-center justify-between gap-4 border-b border-border px-4 py-3 transition last:border-b-0 hover:text-ink-strong;
}
.history-list > a > span {
  @apply min-w-0;
}
.history-list strong,
.history-list small {
  @apply block truncate;
}
.history-list strong {
  @apply text-body-lg font-semibold text-text;
}
.history-list small {
  @apply mt-0.5 text-meta text-text-subtle;
}
.history-list > a > svg {
  @apply size-5 shrink-0 text-text-subtle;
}
.history-status,
.history-error,
.history-empty,
.history-end {
  @apply mt-3 flex min-h-14 items-center justify-center gap-2 rounded-control px-4 text-center text-xs text-text-subtle;
}
.history-error {
  @apply justify-between border border-danger/20 bg-danger-surface text-left text-danger;
}
.history-error button {
  @apply min-h-9 shrink-0 rounded-lg bg-white px-3 font-semibold text-danger;
}
.history-empty {
  @apply card;
}
.history-end {
  @apply text-text-muted;
}
.history-end svg {
  @apply size-4 text-success;
}
.history-spinner {
  @apply size-4 animate-spin rounded-full border-2 border-border border-t-ink;
}
.history-sentinel {
  @apply h-px;
}
</style>
