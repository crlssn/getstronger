<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ChevronRightIcon,
  EllipsisHorizontalIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  PlusIcon,
} from '@heroicons/vue/24/outline'

import { listRoutines } from '@/http/requests'
import type { Routine } from '@/proto/api/v1/routine_service_pb'
import { useDashboardStore } from '@/stores/dashboard'
import usePagination from '@/utils/usePagination'

const routines = ref<Routine[]>([])
const search = ref('')
const isMounted = ref(false)
const dashboardStore = useDashboardStore()
const { hasMorePages, pageToken, resolvePageToken } = usePagination()

onMounted(async () => {
  await Promise.all([fetchRoutines(), dashboardStore.load()])
  isMounted.value = true
})

const filteredRoutines = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return routines.value
  return routines.value.filter((routine) => routine.name.toLowerCase().includes(query))
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
        <p class="eyebrow">Training plans</p>
        <h1>Your routines</h1>
        <p>Choose what is up next or edit the structure of a session.</p>
      </div>
      <RouterLink to="/routines/create" class="create-link"><PlusIcon /> New routine</RouterLink>
    </header>

    <label class="search-field">
      <MagnifyingGlassIcon />
      <input
        v-model="search"
        type="search"
        placeholder="Search routines"
        aria-label="Search routines"
      />
    </label>

    <div v-if="isMounted && filteredRoutines.length" class="routine-grid">
      <article v-for="routine in filteredRoutines" :key="routine.id" class="routine-card">
        <div class="routine-heading">
          <RouterLink :to="`/routines/${routine.id}`">
            <span v-if="routine.id === dashboardStore.preferredRoutineId" class="up-next"
              >Up next</span
            >
            <h2>{{ routine.name }}</h2>
            <p>
              {{ routine.exercises.length }} exercises · About
              {{ Math.max(30, routine.exercises.length * 8) }} min
            </p>
          </RouterLink>
          <ChevronRightIcon />
        </div>
        <div class="exercise-preview">
          <span v-for="exercise in routine.exercises.slice(0, 3)" :key="exercise.id">{{
            exercise.name
          }}</span>
          <span v-if="routine.exercises.length > 3">+{{ routine.exercises.length - 3 }} more</span>
        </div>
        <div class="routine-actions">
          <RouterLink :to="`/workouts/routine/${routine.id}`" class="start-link"
            ><PlayIcon /> Start</RouterLink
          >
          <RouterLink :to="`/routines/${routine.id}`" class="view-link">View routine</RouterLink>
          <details class="routine-menu">
            <summary aria-label="Routine actions"><EllipsisHorizontalIcon /></summary>
            <div>
              <RouterLink :to="`/routines/${routine.id}/edit`">Edit routine</RouterLink>
              <button
                v-if="routine.id !== dashboardStore.preferredRoutineId"
                type="button"
                @click="makeUpNext(routine.id)"
              >
                Make up next
              </button>
            </div>
          </details>
        </div>
      </article>
    </div>

    <section v-else-if="isMounted" class="empty-state">
      <h2>{{ search ? 'No matching routines' : 'No routines yet' }}</h2>
      <p>
        {{ search ? 'Try another search.' : 'Create a routine to make your workouts repeatable.' }}
      </p>
      <RouterLink v-if="!search" to="/routines/create" class="create-link"
        ><PlusIcon /> Create routine</RouterLink
      >
    </section>

    <button v-if="hasMorePages" type="button" class="load-more" @click="fetchRoutines">
      Load more routines
    </button>
  </div>
</template>

<style scoped>
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
  @apply inline-flex min-h-11 w-max items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700;
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
.routine-grid {
  @apply grid gap-4 md:grid-cols-2;
}
.routine-card {
  @apply flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm;
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
.routine-heading h2 {
  @apply text-xl font-semibold tracking-tight text-slate-950;
}
.routine-heading p {
  @apply mt-1 text-sm text-slate-500;
}
.up-next {
  @apply mb-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700;
}
.exercise-preview {
  @apply flex flex-wrap gap-2;
}
.exercise-preview span {
  @apply rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600;
}
.routine-actions {
  @apply relative mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4;
}
.routine-actions a,
.routine-actions button {
  @apply inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold;
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
  @apply grid size-10 cursor-pointer list-none place-items-center rounded-xl text-slate-500 hover:bg-slate-100;
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
  @apply flex min-h-10 w-full justify-start rounded-lg px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50;
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
