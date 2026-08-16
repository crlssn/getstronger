<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  BookOpenIcon,
  FireIcon,
  MagnifyingGlassIcon,
  RectangleStackIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'

import { listExercises, listPlans, listRoutines, searchUsers } from '@/http/requests'
import type { Exercise, User } from '@/proto/api/v1/shared_pb'
import type { Plan, Routine } from '@/proto/api/v1/routine_service_pb'

const maxResultsPerGroup = 5

const searchOpen = defineModel<boolean>('open', { default: false })
const input = ref<HTMLInputElement | null>(null)
const users = ref<User[]>([])
const routines = ref<Routine[]>([])
const plans = ref<Plan[]>([])
const exercises = ref<Exercise[]>([])
const query = ref('')
const searching = ref(false)
const hasSearched = ref(false)
let searchSequence = 0

const hasResults = computed(
  () =>
    users.value.length > 0 ||
    routines.value.length > 0 ||
    plans.value.length > 0 ||
    exercises.value.length > 0,
)

const openSearch = () => {
  searchOpen.value = true
}

// Focus follows the open state rather than the button, so a caller that opens
// search from elsewhere on the page lands the cursor in the field too.
watch(searchOpen, async (open) => {
  if (!open) return
  await nextTick()
  input.value?.focus()
})

const clearResults = () => {
  users.value = []
  routines.value = []
  plans.value = []
  exercises.value = []
}

const closeSearch = () => {
  searchSequence += 1
  query.value = ''
  clearResults()
  searching.value = false
  hasSearched.value = false
  searchOpen.value = false
}

const onSearch = async () => {
  const searchQuery = query.value.trim()
  const sequence = ++searchSequence
  if (searchQuery.length < 3) {
    clearResults()
    searching.value = false
    hasSearched.value = false
    return
  }

  searching.value = true
  const [userResponse, routineResponse, planResponse, exerciseResponse] = await Promise.all([
    searchUsers(searchQuery, new Uint8Array(0)),
    listRoutines(new Uint8Array(0), searchQuery),
    listPlans(),
    listExercises(new Uint8Array(0), searchQuery),
  ])
  if (sequence !== searchSequence) return

  users.value = userResponse?.users ?? []
  routines.value = (routineResponse?.routines ?? []).slice(0, maxResultsPerGroup)
  plans.value = (planResponse?.plans ?? [])
    .filter((plan) => plan.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .slice(0, maxResultsPerGroup)
  exercises.value = (exerciseResponse?.exercises ?? []).slice(0, maxResultsPerGroup)
  searching.value = false
  hasSearched.value = true
}
</script>

<template>
  <div class="home-actions" :class="{ searching: searchOpen }">
    <button
      v-if="!searchOpen"
      type="button"
      class="search-trigger"
      :aria-label="$t('search.open')"
      @click="openSearch"
    >
      <MagnifyingGlassIcon />
    </button>

    <section v-if="searchOpen" class="search-panel" :aria-label="$t('search.open')">
      <div class="search-field">
        <MagnifyingGlassIcon />
        <input
          ref="input"
          v-model="query"
          type="search"
          :placeholder="$t('search.placeholder')"
          :aria-label="$t('search.placeholder')"
          @input="onSearch"
          @keydown.esc="closeSearch"
        />
        <button type="button" :aria-label="$t('search.close')" @click="closeSearch">
          <XMarkIcon />
        </button>
      </div>
      <div v-if="hasResults" class="search-results">
        <template v-if="users.length">
          <p class="group-label">{{ $t('search.people') }}</p>
          <RouterLink
            v-for="user in users"
            :key="user.id"
            :to="`/users/${user.id}`"
            @click="closeSearch"
          >
            <span class="avatar">{{ user.firstName.charAt(0) }}{{ user.lastName.charAt(0) }}</span>
            <span>
              <strong>{{ user.firstName }} {{ user.lastName }}</strong>
              <small>{{ $t('search.viewProfile') }}</small>
            </span>
          </RouterLink>
        </template>
        <template v-if="routines.length">
          <p class="group-label">{{ $t('search.routines') }}</p>
          <RouterLink
            v-for="routine in routines"
            :key="routine.id"
            :to="`/routines/${routine.id}`"
            @click="closeSearch"
          >
            <span class="avatar"><FireIcon /></span>
            <span>
              <strong>{{ routine.name }}</strong>
              <small>
                {{ $t('home.exerciseCount', routine.exercises.length) }}
              </small>
            </span>
          </RouterLink>
        </template>
        <template v-if="plans.length">
          <p class="group-label">{{ $t('search.plans') }}</p>
          <RouterLink
            v-for="plan in plans"
            :key="plan.id"
            :to="`/plans/${plan.id}`"
            @click="closeSearch"
          >
            <span class="avatar"><RectangleStackIcon /></span>
            <span>
              <strong>{{ plan.name }}</strong>
              <small>
                {{ plan.routines.length }} {{ $t('common.routines').toLocaleLowerCase() }}
              </small>
            </span>
          </RouterLink>
        </template>
        <template v-if="exercises.length">
          <p class="group-label">{{ $t('search.exercises') }}</p>
          <RouterLink
            v-for="exercise in exercises"
            :key="exercise.id"
            :to="`/exercises/${exercise.id}`"
            @click="closeSearch"
          >
            <span class="avatar"><BookOpenIcon /></span>
            <span>
              <strong>{{ exercise.name }}</strong>
              <small>{{ $t('search.viewExercise') }}</small>
            </span>
          </RouterLink>
        </template>
      </div>
      <p v-else-if="searching" class="search-hint" aria-live="polite">
        {{ $t('search.searching') }}
      </p>
      <p v-else-if="hasSearched" class="search-hint">{{ $t('search.nothingFound', { query }) }}</p>
      <p v-else class="search-hint">{{ $t('search.hint') }}</p>
    </section>
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.home-actions {
  @apply flex shrink-0 items-center;
}
.home-actions.searching {
  @apply w-full;
}
.search-trigger {
  @apply grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-900;
}
.search-trigger svg {
  @apply size-5;
}
.search-panel {
  @apply w-full;
}
.search-field {
  @apply card flex w-full items-center gap-2 px-4 transition focus-within:border-ink-muted;
}
.search-field > svg {
  @apply size-6 shrink-0 text-slate-500;
}
.search-field input {
  @apply h-14 min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-slate-950 placeholder:text-slate-400 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0;
}
.search-field button {
  @apply grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-200;
}
.search-field button svg {
  @apply size-5;
}
.search-results {
  @apply card mt-3 w-full overflow-hidden;
}
.group-label {
  @apply border-b border-slate-100 bg-slate-50/60 px-4 pb-2 pt-3 text-xs font-semibold uppercase tracking-wider text-slate-500;
}
.search-results a {
  @apply grid w-full grid-cols-[auto_1fr] items-center gap-3 border-b border-slate-100 p-4 transition last:border-b-0 hover:bg-stone-50;
}
.search-results strong,
.search-results small {
  @apply block truncate;
}
.search-results strong {
  @apply text-sm text-slate-900;
}
.search-results small {
  @apply mt-0.5 text-xs text-slate-500;
}
.avatar {
  @apply grid size-11 place-items-center rounded-xl bg-stone-200 text-sm font-semibold text-stone-800;
}
.avatar svg {
  @apply size-5;
}
.search-hint {
  @apply px-1 py-4 text-sm text-slate-500;
}
</style>
