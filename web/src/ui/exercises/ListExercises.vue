<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronRightIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/vue/24/outline'

import { listExercises } from '@/http/requests'
import type { Exercise } from '@/proto/api/v1/shared_pb'
import usePagination from '@/utils/usePagination'
import ExerciseTags from '@/ui/exercises/ExerciseTags.vue'

const exercises = ref<Exercise[]>([])
const { t } = useI18n()
const search = ref('')
const loading = ref(true)
const exerciseNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const { hasMorePages, pageToken, resolvePageToken } = usePagination()

onMounted(async () => {
  await fetchExercises()
  loading.value = false
})

const filteredExercises = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return exercises.value
  return exercises.value.filter((exercise) =>
    [exercise.name, ...exercise.tags].join(' ').toLowerCase().includes(query),
  )
})
const groupedExercises = computed(() => {
  const sortedExercises = [...filteredExercises.value].sort((first, second) =>
    exerciseNameCollator.compare(first.name, second.name),
  )
  const groups = new Map<string, Exercise[]>()

  sortedExercises.forEach((exercise) => {
    const letter = exercise.name.trim().charAt(0).toLocaleUpperCase() || '#'
    const group = groups.get(letter)
    if (group) group.push(exercise)
    else groups.set(letter, [exercise])
  })

  return Array.from(groups, ([letter, grouped]) => ({ letter, exercises: grouped }))
})

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
        <p class="eyebrow">{{ t('exercise.library') }}</p>
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

    <div v-if="loading" class="empty-state">{{ t('exercise.loading') }}</div>
    <section v-else-if="filteredExercises.length" class="exercise-list">
      <section v-for="group in groupedExercises" :key="group.letter" class="exercise-group">
        <h2>{{ group.letter }}</h2>
        <div class="exercise-group-card">
          <RouterLink
            v-for="exercise in group.exercises"
            :key="exercise.id"
            :to="`/exercises/${exercise.id}`"
          >
            <span class="exercise-copy">
              <strong>{{ exercise.name }}</strong>
              <ExerciseTags compact class="mt-1" :tags="exercise.tags" />
            </span>
            <ChevronRightIcon />
          </RouterLink>
        </div>
      </section>
      <button v-if="hasMorePages" type="button" class="load-more" @click="fetchExercises">
        {{ t('exercise.loadMore') }}
      </button>
    </section>
    <section v-else class="empty-state">
      <h2>{{ search ? t('exercise.noMatches') : t('exercise.empty') }}</h2>
      <p>
        {{ search ? t('exercise.tryAnotherSearch') : t('exercise.emptyBody') }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.exercise-page {
  @apply space-y-4;
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
.create-link {
  @apply inline-flex min-h-11 w-max items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700;
}
.create-link svg {
  @apply size-5;
}
.search-field {
  @apply flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm;
}
.search-field svg {
  @apply size-5 text-slate-400;
}
.search-field input {
  @apply h-12 w-full border-0 bg-transparent p-0 text-sm placeholder:text-slate-400 focus:ring-0;
}
.exercise-list {
  @apply space-y-4;
}
.exercise-group h2 {
  @apply mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-500;
}
.exercise-group-card {
  @apply overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm;
}
.exercise-group-card > a {
  @apply flex min-h-16 items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 transition hover:text-indigo-700;
}
.exercise-group-card > a:first-child {
  @apply border-t-0;
}
.exercise-copy {
  @apply min-w-0;
}
.exercise-copy strong {
  @apply block truncate text-sm font-semibold text-slate-950;
}
.exercise-group-card > a > svg {
  @apply size-5 shrink-0 text-slate-400;
}
.empty-state {
  @apply rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500;
}
.empty-state h2 {
  @apply text-lg font-semibold text-slate-900;
}
.empty-state p {
  @apply mt-1;
}
.load-more {
  @apply min-h-11 w-full rounded-xl border border-slate-200 bg-white text-sm font-semibold text-indigo-600 shadow-sm;
}
@media (max-width: 420px) {
  .create-link {
    @apply px-3;
  }
}
</style>
