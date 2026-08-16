<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { CheckIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/vue/24/outline'

import { listExercises } from '@/http/requests'
import type { Exercise } from '@/proto/api/v1/shared_pb'
import usePagination from '@/utils/usePagination'
import ExerciseTags from '@/ui/exercises/ExerciseTags.vue'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    initialName?: string
    initialExerciseIds?: string[]
    saving?: boolean
    submitLabel: string
  }>(),
  {
    initialName: '',
    initialExerciseIds: () => [],
    saving: false,
  },
)

const emit = defineEmits<{
  save: [name: string, exerciseIds: string[]]
}>()

const name = ref(props.initialName)
const exercises = ref<Exercise[]>([])
const selectedIds = ref<string[]>([...props.initialExerciseIds])
const search = ref('')
const loading = ref(true)
const { hasMorePages, pageToken, resolvePageToken } = usePagination()

watch(
  () => props.initialName,
  (value) => (name.value = value),
)

watch(
  () => props.initialExerciseIds,
  (value) => (selectedIds.value = [...value]),
  { deep: true },
)

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

const canSubmit = computed(
  () => name.value.trim().length > 0 && selectedIds.value.length > 0 && !props.saving,
)

const fetchExercises = async () => {
  const response = await listExercises(pageToken.value)
  if (!response) return

  exercises.value = [...exercises.value, ...response.exercises]
  pageToken.value = resolvePageToken(response.pagination)
}

const toggleExercise = (exerciseId: string) => {
  selectedIds.value = selectedIds.value.includes(exerciseId)
    ? selectedIds.value.filter((id) => id !== exerciseId)
    : [...selectedIds.value, exerciseId]
}

const submit = () => {
  if (!canSubmit.value) return
  emit('save', name.value.trim(), selectedIds.value)
}
</script>

<template>
  <form class="routine-form" @submit.prevent="submit">
    <header class="form-intro">
      <div>
        <p class="eyebrow">{{ t('routine.form.eyebrow') }}</p>
        <h1>{{ t('routine.form.title') }}</h1>
        <p>{{ t('routine.form.intro') }}</p>
      </div>
      <span class="selection-count">{{ t('routine.form.selectedCount', { count: selectedIds.length }) }}</span>
    </header>

    <section class="form-card">
      <label class="field-label" for="routine-name">{{ t('routine.form.name') }}</label>
      <input
        id="routine-name"
        v-model="name"
        class="name-input"
        type="text"
        required
        autocomplete="off"
        :placeholder="t('routine.form.namePlaceholder')"
      />
    </section>

    <section class="exercise-card">
      <div class="exercise-toolbar">
        <div>
          <h2>{{ t('common.exercises') }}</h2>
          <p>{{ t('routine.form.selectHelp') }}</p>
        </div>
        <label class="search-field">
          <MagnifyingGlassIcon />
          <input
            v-model="search"
            type="search"
            :placeholder="t('common.search')"
            :aria-label="t('exercise.search')"
          />
        </label>
      </div>

      <div v-if="loading" class="empty-row">{{ t('exercise.loading') }}</div>
      <div v-else-if="filteredExercises.length" class="exercise-grid">
        <button
          v-for="exercise in filteredExercises"
          :key="exercise.id"
          type="button"
          class="exercise-option"
          :class="{ selected: selectedIds.includes(exercise.id) }"
          :aria-pressed="selectedIds.includes(exercise.id)"
          @click="toggleExercise(exercise.id)"
        >
          <span class="check-box">
            <CheckIcon v-if="selectedIds.includes(exercise.id)" />
          </span>
          <span class="exercise-copy">
            <strong>{{ exercise.name }}</strong>
            <ExerciseTags compact :tags="exercise.tags" />
          </span>
        </button>
      </div>
      <div v-else class="empty-row">
        {{ search ? t('workout.noExerciseMatches') : t('routine.form.createFirst') }}
      </div>

      <button v-if="hasMorePages" class="load-more" type="button" @click="fetchExercises">
        <PlusIcon /> {{ t('exercise.loadMore') }}
      </button>
    </section>

    <div class="form-actions">
      <RouterLink to="/routines" class="cancel-link">{{ t('common.cancel') }}</RouterLink>
      <button class="save-button" type="submit" :disabled="!canSubmit">
        {{ saving ? t('training.planForm.saving') : submitLabel }}
      </button>
    </div>
  </form>
</template>

<style scoped>
@reference '../../assets/base.css';

.routine-form {
  @apply mx-auto max-w-4xl space-y-5;
}
.form-intro {
  @apply flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between;
}
.eyebrow {
  @apply text-xs font-semibold uppercase tracking-wider text-slate-500;
}
h1 {
  @apply mt-1 text-2xl font-semibold tracking-tight text-slate-950;
}
.form-intro p:last-child {
  @apply mt-2 text-sm text-slate-500;
}
.selection-count {
  @apply w-max rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700;
}
.form-card,
.exercise-card {
  @apply rounded-2xl border border-slate-200 bg-white p-5 shadow-sm;
}
.field-label {
  @apply mb-2 block text-sm font-semibold text-slate-700;
}
.name-input {
  @apply h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-base font-medium text-slate-950 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100;
}
.exercise-toolbar {
  @apply mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between;
}
.exercise-toolbar h2 {
  @apply text-lg font-semibold text-slate-950;
}
.exercise-toolbar p {
  @apply mt-1 text-sm text-slate-500;
}
.search-field {
  @apply flex min-w-52 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3;
}
.search-field svg {
  @apply size-5 text-slate-400;
}
.search-field input {
  @apply h-11 w-full border-0 bg-transparent p-0 text-sm focus:ring-0;
}
.exercise-grid {
  @apply grid gap-2 sm:grid-cols-2;
}
.exercise-option {
  @apply flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50/40;
}
.exercise-option.selected {
  @apply border-indigo-300 bg-indigo-50;
}
.check-box {
  @apply grid size-6 shrink-0 place-items-center rounded-md border-2 border-slate-300 bg-white;
}
.selected .check-box {
  @apply border-indigo-600 bg-indigo-600 text-white;
}
.check-box svg {
  @apply size-4 stroke-[3];
}
.exercise-copy {
  @apply min-w-0;
}
.exercise-copy strong {
  @apply block truncate text-sm font-semibold text-slate-900;
}
.exercise-copy small {
  @apply mt-0.5 block truncate text-xs text-slate-500;
}
.empty-row {
  @apply rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500;
}
.load-more {
  @apply mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50;
}
.load-more svg {
  @apply size-4;
}
.form-actions {
  @apply sticky bottom-20 z-10 flex items-center justify-end gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur md:bottom-4;
}
.cancel-link {
  @apply inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50;
}
.save-button {
  @apply inline-flex min-h-11 items-center rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300;
}
</style>
