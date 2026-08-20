<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  BookOpenIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from '@heroicons/vue/24/outline'

import { listExercises } from '@/http/requests'
import type { Exercise } from '@/proto/api/v1/shared_pb'
import { useActivityStore } from '@/stores/activity'
import usePagination from '@/utils/usePagination'
import {
  activityBucketFor,
  activityBucketLabelKey,
  activityBucketOrder,
  type ActivityBucket,
} from '@/utils/activityBuckets'
import AppEmptyState from '@/ui/components/AppEmptyState.vue'
import AppSkeleton from '@/ui/components/AppSkeleton.vue'
import { measurementsForExercise } from '@/utils/exerciseMeasurements'

const exercises = ref<Exercise[]>([])
const { t } = useI18n()
const search = ref('')
const loading = ref(true)
const activityStore = useActivityStore()
const exerciseNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const { hasMorePages, pageToken, resolvePageToken } = usePagination()

onMounted(async () => {
  await Promise.all([fetchExercises(), activityStore.load()])
  loading.value = false
})

const filteredExercises = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return exercises.value
  return exercises.value.filter((exercise) =>
    [exercise.name, ...exercise.tags].join(' ').toLowerCase().includes(query),
  )
})
// Grouped by when the exercise was last performed, most recent first. Within a
// group the newest sits on top; never-performed ones fall back to name order.
const groupedExercises = computed(() => {
  const buckets = new Map<ActivityBucket, { exercise: Exercise; performedAt?: number }[]>()

  for (const exercise of filteredExercises.value) {
    const performedAt = activityStore.lastPerformedFor(exercise.id)
    const bucket = activityBucketFor(performedAt)
    const entry = { exercise, performedAt: performedAt?.toMillis() }
    const group = buckets.get(bucket)
    if (group) group.push(entry)
    else buckets.set(bucket, [entry])
  }

  return activityBucketOrder
    .filter((bucket) => buckets.has(bucket))
    .map((bucket) => ({
      bucket,
      labelKey: activityBucketLabelKey(bucket),
      exercises: (buckets.get(bucket) ?? [])
        .sort((first, second) => {
          if (first.performedAt !== second.performedAt) {
            return (second.performedAt ?? 0) - (first.performedAt ?? 0)
          }
          return exerciseNameCollator.compare(first.exercise.name, second.exercise.name)
        })
        .map((entry) => entry.exercise),
    }))
})

// The row's meta line: how the exercise is tracked, then where it bites —
// "Weight × Reps · Back, legs". Both halves already live on the exercise.
const exerciseMeta = (exercise: Exercise) => {
  const tracking = measurementsForExercise(exercise)
    .map(({ labelKey }) => t(labelKey))
    .join(' × ')
  const tags = exercise.tags.join(', ')
  return [tracking, tags].filter(Boolean).join(' · ')
}

const fetchExercises = async () => {
  const response = await listExercises(pageToken.value)
  if (!response) return

  exercises.value = [...exercises.value, ...response.exercises]
  pageToken.value = resolvePageToken(response.pagination)
}
</script>

<template>
  <div class="exercise-page">
    <header class="page-intro">
      <div>
        <h1>{{ t('exercise.heading') }}</h1>
      </div>
      <RouterLink to="/exercises/create" class="create-link"
        ><PlusIcon /> {{ t('exercise.new') }}</RouterLink
      >
    </header>

    <label class="search-field">
      <MagnifyingGlassIcon />
      <input
        v-model="search"
        type="search"
        :placeholder="t('exercise.search')"
        :aria-label="t('exercise.search')"
      />
    </label>

    <AppSkeleton v-if="loading" />
    <section v-else-if="filteredExercises.length" class="exercise-list">
      <section v-for="group in groupedExercises" :key="group.bucket" class="exercise-group">
        <h2>{{ t(group.labelKey) }}</h2>
        <div class="exercise-group-card">
          <RouterLink
            v-for="exercise in group.exercises"
            :key="exercise.id"
            :to="`/exercises/${exercise.id}`"
          >
            <span class="exercise-copy">
              <strong>{{ exercise.name }}</strong>
              <small>{{ exerciseMeta(exercise) }}</small>
            </span>
            <ChevronRightIcon />
          </RouterLink>
        </div>
      </section>
      <button v-if="hasMorePages" type="button" class="load-more" @click="fetchExercises">
        {{ t('exercise.loadMore') }}
      </button>
    </section>
    <AppEmptyState
      v-else
      :action="search ? 'none' : { label: t('exercise.new'), to: '/exercises/create' }"
      :body="search ? t('exercise.tryAnotherSearch') : t('exercise.emptyBody')"
      :title="search ? t('exercise.noMatches') : t('exercise.empty')"
    >
      <template #icon><BookOpenIcon /></template>
      <template #action-icon><PlusIcon /></template>
    </AppEmptyState>
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.exercise-page {
  @apply space-y-4;
}
.page-intro {
  @apply flex items-center justify-between gap-4 px-1;
}
.eyebrow {
  @apply text-eyebrow font-bold uppercase text-text-subtle;
}
h1 {
  @apply mt-1 text-display font-bold text-text;
}
.create-link {
  @apply inline-flex min-h-(--size-control) w-max items-center gap-2 rounded-control bg-ink px-4 text-sm font-semibold text-white hover:bg-ink-strong;
}
.create-link svg {
  @apply size-5;
}
.search-field {
  @apply flex items-center gap-2 rounded-control border border-border bg-surface px-4 shadow-card;
}
.search-field svg {
  @apply size-5 text-text-subtle;
}
.search-field input {
  @apply h-12 w-full border-0 bg-transparent p-0 text-sm placeholder:text-text-subtle focus:ring-0;
}
.exercise-list {
  @apply space-y-4;
}
.exercise-group h2 {
  @apply mb-2 px-1 text-eyebrow font-bold uppercase text-text-subtle;
}
.exercise-group-card {
  @apply card overflow-hidden;
}
.exercise-group-card > a {
  @apply flex min-h-16 items-center justify-between gap-3 border-t border-border px-5 py-3 transition hover:text-ink-strong;
}
.exercise-group-card > a:first-child {
  @apply border-t-0;
}
.exercise-copy {
  @apply min-w-0;
}
.exercise-copy strong {
  @apply block truncate text-body-lg font-semibold text-text;
}
.exercise-copy small {
  @apply mt-0.5 block truncate text-meta text-text-subtle;
}
.exercise-group-card > a > svg {
  @apply size-5 shrink-0 text-text-subtle;
}
.empty-state {
  @apply card p-6 text-sm text-text-subtle;
}
.empty-state h2 {
  @apply text-title font-semibold text-text;
}
.empty-state p {
  @apply mt-1;
}
.load-more {
  @apply min-h-(--size-control) w-full rounded-control border border-border bg-white text-sm font-semibold text-ink shadow-card;
}
@media (max-width: 420px) {
  .create-link {
    @apply px-3;
  }
}
</style>
