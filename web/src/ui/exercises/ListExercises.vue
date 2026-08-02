<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ChevronRightIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/vue/24/outline'

import { listExercises } from '@/http/requests'
import type { Exercise } from '@/proto/api/v1/shared_pb'
import usePagination from '@/utils/usePagination'

const exercises = ref<Exercise[]>([])
const search = ref('')
const loading = ref(true)
const { hasMorePages, pageToken, resolvePageToken } = usePagination()

onMounted(async () => {
  await fetchExercises()
  loading.value = false
})

const filteredExercises = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return exercises.value
  return exercises.value.filter((exercise) =>
    `${exercise.name} ${exercise.label}`.toLowerCase().includes(query),
  )
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
      <div><p class="eyebrow">Exercise library</p><h1>Your movements</h1><p>Review progress or add a custom exercise.</p></div>
      <RouterLink to="/exercises/create" class="create-link"><PlusIcon /> New exercise</RouterLink>
    </header>

    <label class="search-field">
      <MagnifyingGlassIcon />
      <input v-model="search" type="search" placeholder="Search exercises" aria-label="Search exercises" />
    </label>

    <div v-if="loading" class="empty-state">Loading exercises…</div>
    <div v-else-if="filteredExercises.length" class="exercise-grid">
      <RouterLink
        v-for="exercise in filteredExercises"
        :key="exercise.id"
        :to="`/exercises/${exercise.id}`"
        class="exercise-card"
      >
        <span><strong>{{ exercise.name }}</strong><small v-if="exercise.label">{{ exercise.label }}</small></span>
        <ChevronRightIcon />
      </RouterLink>
    </div>
    <section v-else class="empty-state">
      <h2>{{ search ? 'No matching exercises' : 'No exercises yet' }}</h2>
      <p>{{ search ? 'Try another search.' : 'Add your first movement to start building routines.' }}</p>
    </section>

    <button v-if="hasMorePages" type="button" class="load-more" @click="fetchExercises">Load more exercises</button>
  </div>
</template>

<style scoped>
.exercise-page { @apply space-y-5; }
.page-intro { @apply flex flex-col gap-4 px-1 sm:flex-row sm:items-end sm:justify-between; }
.eyebrow { @apply text-xs font-semibold uppercase tracking-wider text-slate-500; }
h1 { @apply mt-1 text-2xl font-semibold tracking-tight text-slate-950; }
.page-intro p:last-child { @apply mt-2 text-sm text-slate-500; }
.create-link { @apply inline-flex min-h-11 w-max items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700; }
.create-link svg { @apply size-5; }
.search-field { @apply flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm; }
.search-field svg { @apply size-5 text-slate-400; }
.search-field input { @apply h-12 w-full border-0 bg-transparent p-0 text-sm placeholder:text-slate-400 focus:ring-0; }
.exercise-grid { @apply grid gap-3 sm:grid-cols-2 lg:grid-cols-3; }
.exercise-card { @apply flex min-h-24 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md; }
.exercise-card span { @apply min-w-0; }
.exercise-card strong { @apply block truncate text-base font-semibold text-slate-950; }
.exercise-card small { @apply mt-1 block truncate text-xs text-slate-500; }
.exercise-card svg { @apply size-5 shrink-0 text-slate-400; }
.empty-state { @apply rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500; }
.empty-state h2 { @apply text-lg font-semibold text-slate-900; }
.empty-state p { @apply mt-1; }
.load-more { @apply mx-auto block rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700; }
</style>
