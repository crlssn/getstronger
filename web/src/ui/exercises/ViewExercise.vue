<script setup lang="ts">
import type { DropdownItem } from '@/types/dropdown'
import { type Exercise, type Set } from '@/proto/api/v1/shared_pb.ts'

import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { BoltIcon, ChevronRightIcon, TrashIcon, TrophyIcon } from '@heroicons/vue/24/outline'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/vue'
import { useI18n } from 'vue-i18n'

import router from '@/router/router'
import { useAuthStore } from '@/stores/auth.ts'
import { useAlertStore } from '@/stores/alerts'
import { useConfirmationStore } from '@/stores/confirmation'
import { usePageTitleStore } from '@/stores/pageTitle'
import { useWorkoutStore } from '@/stores/workout'
import DropdownButton from '@/ui/components/DropdownButton.vue'
import ExerciseChart from '@/ui/components/ExerciseChart.vue'
import { formatToShortDateTime } from '@/utils/datetime.ts'
import { deleteExercise, getExercise, listSets } from '@/http/requests'
import usePagination from '@/utils/usePagination'
import ExerciseTags from '@/ui/exercises/ExerciseTags.vue'
import { formatExerciseSet } from '@/utils/exerciseMeasurements'
import useActiveWorkout from '@/utils/useActiveWorkout'

const sets = ref<Set[]>([])
const exercise = ref<Exercise>()
const loading = ref(true)
const deleteDialogOpen = ref(false)
const deleting = ref(false)

const route = useRoute()
const authStore = useAuthStore()
const pageTitle = usePageTitleStore()
const alertStore = useAlertStore()
const confirmationStore = useConfirmationStore()
const workoutStore = useWorkoutStore()
const { t } = useI18n()
const { savedRoutineName, savedWorkout } = useActiveWorkout()
const { hasMorePages, pageToken, resolvePageToken } = usePagination()

onMounted(async () => {
  const response = await getExercise(route.params.id as string)
  if (response?.exercise) {
    exercise.value = response.exercise
    pageTitle.setPageTitle(response.exercise.name)
    await fetchSets()
  }
  loading.value = false
})

const fetchSets = async () => {
  const response = await listSets([], [route.params.id as string], pageToken.value)
  if (!response) return

  sets.value = [...sets.value, ...response.sets]
  pageToken.value = resolvePageToken(response.pagination)
}

const isOwner = computed(() => authStore.userId === exercise.value?.userId)

const exerciseActions = computed<DropdownItem[]>(() => [
  { href: `/exercises/${route.params.id}/edit`, title: t('exercise.update') },
  {
    func: async () => {
      deleteDialogOpen.value = true
    },
    title: t('exercise.delete'),
  },
])

const onDeleteExercise = async () => {
  if (deleting.value) return
  deleting.value = true

  try {
    const response = await deleteExercise(route.params.id as string)
    deleteDialogOpen.value = false
    if (!response) {
      alertStore.setErrorWithoutPageRefresh(t('exercise.view.deleteFailed'))
      return
    }

    alertStore.setSuccess(t('exercise.view.deleted'))
    await router.push('/exercises')
  } finally {
    deleting.value = false
  }
}

const onStartQuickWorkout = async () => {
  if (!exercise.value) return

  const activeRoutineID = savedWorkout.value?.[0]
  if (activeRoutineID) {
    const confirmed = await confirmationStore.confirm({
      body: t('exercise.replaceWorkoutConfirmBody', { exercise: exercise.value.name }),
      confirmLabel: t('exercise.startQuickWorkout'),
      destructive: true,
      title: t('exercise.replaceWorkoutConfirmTitle', { workout: savedRoutineName.value }),
    })
    if (!confirmed) return
  }

  if (activeRoutineID) workoutStore.removeWorkout(activeRoutineID)
  workoutStore.startQuickWorkoutWithExercise(exercise.value)
  await router.push('/workouts/quick')
}

const downSample = (data: Set[], sampleSize: number): Set[] => {
  if (data.length <= sampleSize) return data
  const sampled: Set[] = []
  const step = Math.ceil(data.length / sampleSize)
  for (let index = 0; index < data.length; index += step) sampled.push(data[index])
  return sampled
}
</script>

<template>
  <div v-if="loading" class="loading-card" aria-live="polite" aria-busy="true">
    <span class="sr-only">{{ $t('common.loading') }}</span>
    <div class="loading-line" aria-hidden="true"></div>
    <div class="loading-line" aria-hidden="true"></div>
    <div class="loading-line w-full" aria-hidden="true"></div>
  </div>
  <div v-else-if="exercise" class="exercise-detail">
    <!-- Management stays out of the content flow: edit and delete live in the
         page header's overflow menu so the trend and history lead the page. -->
    <Teleport v-if="isOwner" to="#page-nav-action">
      <DropdownButton :label="t('exercise.view.actionsLabel')" :items="exerciseActions" />
    </Teleport>

    <ExerciseTags :tags="exercise.tags" />

    <button v-if="isOwner" type="button" class="start-quick-card" @click="onStartQuickWorkout">
      <span class="start-quick-icon"><BoltIcon /></span>
      <span class="start-quick-copy">
        <strong>{{ t('exercise.startQuickWorkout') }}</strong>
        <small>{{ t('exercise.startQuickWorkoutBody', { name: exercise.name }) }}</small>
      </span>
      <ChevronRightIcon class="start-quick-chevron" />
    </button>

    <!-- The dialog root renders through Headless UI's portal and never picks
         up this component's scope id, so its layout must be global utilities
         rather than a scoped class. -->
    <Dialog
      :open="deleteDialogOpen"
      class="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      @close="deleteDialogOpen = false"
    >
      <div class="dialog-backdrop" aria-hidden="true" />
      <DialogPanel class="dialog-panel">
        <DialogTitle>{{ t('exercise.view.deleteTitle', { name: exercise.name }) }}</DialogTitle>
        <p>{{ t('exercise.view.deleteBody') }}</p>
        <div class="dialog-actions">
          <button type="button" class="dialog-cancel" @click="deleteDialogOpen = false">
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="dialog-delete"
            :disabled="deleting"
            @click="onDeleteExercise"
          >
            <TrashIcon /> {{ t('exercise.delete') }}
          </button>
        </div>
      </DialogPanel>
    </Dialog>

    <section v-if="sets.length" class="chart-card">
      <p class="eyebrow">{{ t('exercise.trend') }}</p>
      <ExerciseChart :sets="downSample(sets, 60)" :exercise="exercise" />
    </section>

    <section class="sets-card">
      <header>
        <div>
          <p class="eyebrow">{{ t('exercise.history') }}</p>
          <h2>{{ t('exercise.loggedSets') }}</h2>
        </div>
        <span>{{ sets.length }}</span>
      </header>

      <div v-if="sets.length" class="set-list">
        <RouterLink v-for="set in sets" :key="set.id" :to="`/workouts/${set.metadata?.workoutId}`">
          <span class="set-copy">
            <strong>{{ formatExerciseSet(set, exercise) }}</strong>
            <small>{{ formatToShortDateTime(set.metadata?.createdAt) }}</small>
          </span>
          <span v-if="set.metadata?.personalBest" class="record-pill"
            ><TrophyIcon /> {{ t('exercise.view.prPill') }}</span
          >
          <ChevronRightIcon />
        </RouterLink>
      </div>
      <p v-else class="empty-copy">{{ t('exercise.view.emptyHistory') }}</p>

      <button v-if="hasMorePages" type="button" class="load-more" @click="fetchSets">
        {{ t('exercise.view.loadMoreSets') }}
      </button>
    </section>
  </div>
  <section v-else class="empty-card">
    <h1>{{ t('exercise.unavailable') }}</h1>
    <p>{{ t('exercise.view.unavailableBody') }}</p>
    <RouterLink to="/exercises">{{ t('exercise.view.viewExercises') }}</RouterLink>
  </section>
</template>

<style scoped>
@reference '../../assets/base.css';

.exercise-detail {
  @apply mx-auto max-w-3xl space-y-5;
}
.empty-card,
.chart-card,
.sets-card {
  @apply card p-5;
}
.start-quick-card {
  @apply card flex min-h-20 w-full items-center gap-4 p-4 text-left transition hover:border-ink-border hover:bg-ink-surface;
}
.start-quick-icon {
  @apply flex size-12 shrink-0 items-center justify-center rounded-control bg-surface-inverse text-white;
}
.start-quick-icon svg {
  @apply size-6;
}
.start-quick-copy {
  @apply min-w-0 flex-1;
}
.start-quick-copy strong,
.start-quick-copy small {
  @apply block;
}
.start-quick-copy strong {
  @apply text-sm font-semibold text-text;
}
.start-quick-copy small {
  @apply mt-1 truncate text-xs text-text-subtle;
}
.start-quick-chevron {
  @apply size-5 shrink-0 text-text-subtle;
}
.eyebrow {
  @apply mb-3 text-eyebrow font-bold uppercase text-text-subtle;
}
.chart-card {
  @apply space-y-4;
}
.sets-card > header {
  @apply -mx-5 -mt-5 flex items-end justify-between gap-3 px-5 py-5;
}
.sets-card h2,
.empty-card h1 {
  @apply text-title font-semibold text-text;
}
.sets-card > header > span {
  @apply rounded-full bg-info-surface px-2.5 py-1 text-xs font-semibold text-text-muted;
}
.set-list {
  @apply -mx-5 divide-y divide-border border-t border-border;
}
.set-list > a {
  @apply grid min-h-16 grid-cols-[1fr_auto_auto] items-center gap-3 px-5 py-3 transition hover:text-ink-strong;
}
.set-copy {
  @apply min-w-0;
}
.set-copy strong,
.set-copy small {
  @apply block;
}
.set-copy strong {
  @apply text-sm font-semibold text-text;
}
.set-copy small {
  @apply mt-1 text-xs text-text-subtle;
}
.record-pill {
  @apply inline-flex items-center gap-1 rounded-full bg-record-surface px-2.5 py-1 text-xs font-semibold text-record-strong;
}
.record-pill svg,
.set-list > a > svg {
  @apply size-4;
}
.set-list > a > svg {
  @apply text-text-subtle;
}
.empty-copy {
  @apply rounded-control bg-ink-surface p-4 text-sm text-text-subtle;
}
.load-more {
  @apply mt-3 min-h-(--size-control) w-full rounded-control border border-border text-sm font-semibold text-text-muted hover:bg-ink-surface;
}
.dialog-backdrop {
  @apply fixed inset-0 bg-black/50;
}
.dialog-panel {
  @apply relative w-full max-w-sm rounded-card border border-border bg-white p-5 shadow-overlay;
}
.dialog-panel h2 {
  @apply text-title font-semibold text-text;
}
.dialog-panel p {
  @apply mt-2 text-sm text-text-muted;
}
.dialog-actions {
  @apply mt-5 grid gap-2;
}
.dialog-cancel,
.dialog-delete {
  @apply flex min-h-(--size-control) w-full items-center justify-center gap-2 rounded-control text-sm font-semibold;
}
.dialog-cancel {
  @apply border border-border text-text-muted hover:bg-ink-surface;
}
.dialog-delete {
  @apply bg-danger text-white hover:bg-danger-strong disabled:opacity-60;
}
.dialog-delete svg {
  @apply size-5;
}
.empty-card p {
  @apply mt-2 text-sm text-text-subtle;
}
.empty-card a {
  @apply mt-4 inline-flex min-h-(--size-control) items-center rounded-control bg-ink px-4 text-sm font-semibold text-white;
}
</style>
