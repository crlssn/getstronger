<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ChevronRightIcon,
  EllipsisHorizontalIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  PlusIcon,
  RectangleStackIcon,
} from '@heroicons/vue/24/outline'

import { listRoutines } from '@/http/requests'
import type { Routine } from '@/proto/api/v1/routine_service_pb'
import { useActivityStore } from '@/stores/activity'
import { useDashboardStore } from '@/stores/dashboard'
import usePagination from '@/utils/usePagination'
import AppEmptyState from '@/ui/components/AppEmptyState.vue'
import TrainingTabs from '@/ui/components/TrainingTabs.vue'
import {
  routineActivityBucketFor,
  routineActivityBucketLabelKey,
  routineActivityBucketOrder,
  type RoutineActivityBucket,
} from '@/utils/activityBuckets'

const { t } = useI18n()
const routines = ref<Routine[]>([])
const search = ref('')
const isMounted = ref(false)
const dashboardStore = useDashboardStore()
const activityStore = useActivityStore()
const routineNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const { hasMorePages, pageToken, resolvePageToken } = usePagination()

onMounted(async () => {
  await Promise.all([fetchRoutines(), dashboardStore.load(), activityStore.load()])
  isMounted.value = true
})

const filteredRoutines = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return routines.value
  return routines.value.filter((routine) => routine.name.toLowerCase().includes(query))
})

const maxNamedExercises = 3
const exerciseSummary = (routine: Routine) => {
  const names = routine.exercises.slice(0, maxNamedExercises).map((exercise) => exercise.name)
  const remaining = routine.exercises.length - names.length
  if (!names.length) return t('routine.noExercises')
  return remaining > 0
    ? `${names.join(' · ')} ${t('routine.andMore', { count: remaining })}`
    : names.join(' · ')
}

// Grouped by when the routine was last performed, most recent first. Routines
// unused for 30 days join untried routines in the final group.
const groupedRoutines = computed(() => {
  const buckets = new Map<RoutineActivityBucket, { routine: Routine; performedAt?: number }[]>()

  for (const routine of filteredRoutines.value) {
    const performedAt = activityStore.routineLastPerformedFor(routine.id)
    const bucket = routineActivityBucketFor(performedAt)
    const entry = { routine, performedAt: performedAt?.toMillis() }
    const group = buckets.get(bucket)
    if (group) group.push(entry)
    else buckets.set(bucket, [entry])
  }

  return routineActivityBucketOrder
    .filter((bucket) => buckets.has(bucket))
    .map((bucket) => ({
      bucket,
      labelKey: routineActivityBucketLabelKey(bucket),
      routines: (buckets.get(bucket) ?? [])
        .sort((first, second) => {
          if (first.performedAt !== second.performedAt) {
            return (second.performedAt ?? 0) - (first.performedAt ?? 0)
          }
          return routineNameCollator.compare(first.routine.name, second.routine.name)
        })
        .map((entry) => entry.routine),
    }))
})

const fetchRoutines = async () => {
  const response = await listRoutines(pageToken.value)
  if (!response) return
  routines.value = [...routines.value, ...response.routines]
  pageToken.value = resolvePageToken(response.pagination)
}

const makeUpNext = async (routineId: string) => {
  await dashboardStore.selectRoutine(routineId)
}
</script>

<template>
  <div class="routine-page">
    <header class="page-intro">
      <div>
        <h1>{{ t('training.heading') }}</h1>
        <p>{{ t('training.routinesDescription') }}</p>
      </div>
      <RouterLink to="/routines/create" class="create-link"
        ><PlusIcon /> {{ t('training.newRoutine') }}</RouterLink
      >
    </header>

    <TrainingTabs />

    <label class="search-field">
      <MagnifyingGlassIcon />
      <input
        v-model="search"
        type="search"
        :placeholder="t('training.searchRoutines')"
        :aria-label="t('training.searchRoutines')"
      />
    </label>

    <template v-if="isMounted && filteredRoutines.length">
      <section v-for="group in groupedRoutines" :key="group.bucket" class="routine-group">
        <h2 class="group-heading">{{ t(group.labelKey) }}</h2>
        <div class="routine-grid">
          <article v-for="routine in group.routines" :key="routine.id" class="routine-card">
            <div class="routine-heading">
              <RouterLink :to="`/routines/${routine.id}`">
                <span v-if="routine.id === dashboardStore.preferredRoutineId" class="up-next">{{
                  t('home.upNext')
                }}</span>
                <h3>{{ routine.name }}</h3>
                <p class="routine-exercises">{{ exerciseSummary(routine) }}</p>
                <p class="routine-meta">
                  {{ t('home.exerciseCount', routine.exercises.length) }} ·
                  {{
                    t('home.aboutMinutes', { count: Math.max(30, routine.exercises.length * 8) })
                  }}
                </p>
              </RouterLink>
              <ChevronRightIcon />
            </div>
            <div class="routine-actions">
              <RouterLink :to="`/workouts/routine/${routine.id}`" class="start-link"
                ><PlayIcon /> {{ t('routine.list.start') }}</RouterLink
              >
              <RouterLink :to="`/routines/${routine.id}`" class="view-link">{{
                t('routine.list.view')
              }}</RouterLink>
              <details class="routine-menu">
                <summary :aria-label="t('routine.list.actionsAria')">
                  <EllipsisHorizontalIcon />
                </summary>
                <div>
                  <RouterLink :to="`/routines/${routine.id}/edit`">{{
                    t('routine.list.edit')
                  }}</RouterLink>
                  <button
                    v-if="routine.id !== dashboardStore.preferredRoutineId"
                    type="button"
                    @click="makeUpNext(routine.id)"
                  >
                    {{ t('routine.makeUpNext') }}
                  </button>
                </div>
              </details>
            </div>
          </article>
        </div>
      </section>
    </template>

    <AppEmptyState
      v-else-if="isMounted"
      :action="search ? 'none' : { label: t('home.createRoutine'), to: '/routines/create' }"
      :body="search ? t('exercise.tryAnotherSearch') : t('routine.list.emptyBody')"
      :title="search ? t('training.noMatchingRoutines') : t('training.noRoutines')"
    >
      <template #icon><RectangleStackIcon /></template>
      <template #action-icon><PlusIcon /></template>
    </AppEmptyState>

    <button v-if="hasMorePages" type="button" class="load-more" @click="fetchRoutines">
      {{ t('routine.list.loadMore') }}
    </button>
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.routine-page {
  @apply space-y-5;
}
.page-intro {
  @apply flex items-center justify-between gap-4 px-1;
}
.eyebrow {
  @apply text-xs font-semibold uppercase tracking-wider text-slate-500;
}
h1 {
  @apply mt-1 text-2xl font-semibold tracking-tight text-slate-950;
}
.page-intro p:last-child {
  @apply mt-1 max-w-xl text-sm text-slate-500;
}
.create-link {
  @apply inline-flex min-h-(--size-control) w-max items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700;
}
.create-link svg {
  @apply size-5;
}
.search-field {
  @apply card flex items-center gap-2 px-4;
}
.search-field svg {
  @apply size-5 text-slate-400;
}
.search-field input {
  @apply h-12 w-full border-0 bg-transparent p-0 text-sm placeholder:text-slate-400 focus:ring-0;
}
.routine-group {
  @apply space-y-3;
}
.group-heading {
  @apply px-1 text-xs font-semibold uppercase tracking-wider text-slate-500;
}
.routine-grid {
  @apply grid gap-4 md:grid-cols-2;
}
.routine-card {
  @apply card flex flex-col gap-4 p-5;
}
.routine-heading {
  @apply flex items-start justify-between gap-3;
}
.routine-heading > a {
  @apply min-w-0 flex-1;
}
.routine-heading > svg {
  @apply mt-2 size-5 text-slate-400;
}
.routine-heading h3 {
  @apply text-xl font-semibold tracking-tight text-slate-950;
}
.routine-exercises {
  @apply mt-1 text-sm text-slate-700;
}
.routine-meta {
  @apply mt-0.5 text-xs text-slate-500;
}
.up-next {
  @apply mb-2 inline-flex rounded-full bg-success-surface px-2.5 py-1 text-xs font-semibold text-success;
}
.routine-actions {
  @apply relative mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4;
}
.routine-actions a,
.routine-actions button {
  @apply inline-flex min-h-(--size-control) items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold;
}
.routine-actions svg {
  @apply size-4;
}
.start-link {
  @apply bg-indigo-600 text-white hover:bg-indigo-700;
}
.view-link {
  @apply border border-slate-200 text-slate-700 hover:bg-slate-50;
}
.routine-menu {
  @apply relative ml-auto;
}
.routine-menu summary {
  @apply grid size-11 cursor-pointer list-none place-items-center rounded-xl text-slate-500 hover:bg-slate-100;
}
.routine-menu summary::-webkit-details-marker {
  @apply hidden;
}
.routine-menu summary svg {
  @apply size-5;
}
.routine-menu > div {
  @apply absolute bottom-12 right-0 z-10 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg;
}
.routine-menu > div a,
.routine-menu > div button {
  @apply flex min-h-(--size-control-sm) items-center w-full justify-start rounded-lg px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50;
}
@media (max-width: 520px) {
  .page-intro {
    @apply items-center;
  }
  .page-intro p:last-child {
    @apply hidden;
  }
  .create-link {
    @apply shrink-0;
  }
}
.empty-state {
  @apply grid justify-items-start gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-6;
}
.empty-state h2 {
  @apply text-xl font-semibold;
}
.empty-state p {
  @apply text-sm text-slate-500;
}
.load-more {
  @apply mx-auto block rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700;
}
</style>
