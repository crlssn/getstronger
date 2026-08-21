<script setup lang="ts">
import type { SortableEvent } from 'sortablejs'

import { nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useSortable } from '@vueuse/integrations/useSortable'
import {
  Bars3Icon,
  ClockIcon,
  PencilIcon,
  PlayIcon,
  StarIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'

import AppSkeleton from '@/ui/components/AppSkeleton.vue'
import {
  deleteRoutine,
  getPreviousWorkoutSets,
  getRoutine,
  updateExerciseOrder,
} from '@/http/requests'
import type { Routine } from '@/proto/api/v1/routine_service_pb'
import type { ExerciseSets } from '@/proto/api/v1/shared_pb'
import { formatExerciseSet } from '@/utils/exerciseMeasurements'
import { useAlertStore } from '@/stores/alerts'
import { useConfirmationStore } from '@/stores/confirmation'
import { useDashboardStore } from '@/stores/dashboard'
import { usePageTitleStore } from '@/stores/pageTitle'
import ExerciseTags from '@/ui/exercises/ExerciseTags.vue'

const routine = ref<Routine>()
const listElement = ref<HTMLElement | null>(null)
const { t } = useI18n()
const loading = ref(true)
const route = useRoute()
const router = useRouter()
const pageTitleStore = usePageTitleStore()
const alertStore = useAlertStore()
const confirmationStore = useConfirmationStore()
const dashboardStore = useDashboardStore()
const previousSets = ref<ExerciseSets[]>([])

// Ten rows of Plank / Rows / Rows with no numbers on them is a list nobody can
// scan, and two routines both called Arms are indistinguishable until you open
// them. What someone is looking for here is the load, so the row carries it.
const lastSession = (exerciseId: string) => {
  const entry = previousSets.value.find((previous) => previous.exercise?.id === exerciseId)
  const sets = entry?.sets ?? []
  if (!sets.length) return ''

  const heaviest = sets.reduce((top, set) => (Number(set.weight) > Number(top.weight) ? set : top))
  return t('routine.view.lastSession', {
    sets: t('workout.setsCompact', sets.length),
    value: formatExerciseSet(heaviest, entry?.exercise),
  })
}

onMounted(async () => {
  const response = await getRoutine(route.params.id as string)
  routine.value = response?.routine
  pageTitleStore.setPageTitle(routine.value?.name ?? t('common.routine'))
  loading.value = false

  if (!routine.value) return
  const previous = await getPreviousWorkoutSets(routine.value.exercises.map(({ id }) => id))
  if (previous) previousSets.value = previous.exerciseSets
  await nextTick()
  useSortable(listElement, routine.value.exercises, {
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    ghostClass: 'sortable-ghost',
    handle: '.drag-handle',
    onUpdate: onReorder,
  })
})

const onReorder = async (event: SortableEvent) => {
  if (!routine.value) return
  const oldIndex = event.oldIndex ?? 0
  const newIndex = event.newIndex ?? 0
  const [movedExercise] = routine.value.exercises.splice(oldIndex, 1)
  routine.value.exercises.splice(newIndex, 0, movedExercise)
  await updateExerciseOrder(
    routine.value.id,
    routine.value.exercises.map((exercise) => exercise.id),
  )
}

const makeUpNext = async () => {
  if (!routine.value) return
  await dashboardStore.selectRoutine(routine.value.id)
  alertStore.setSuccess(t('routine.upNextToast', { name: routine.value.name }))
}

const onDeleteRoutine = async () => {
  if (!routine.value) return
  const confirmed = await confirmationStore.confirm({
    body: t('routine.deleteConfirmBody'),
    confirmLabel: t('common.delete'),
    destructive: true,
    title: t('routine.deleteConfirmTitle', { name: routine.value.name }),
  })
  if (!confirmed) return

  const response = await deleteRoutine(routine.value.id)
  if (!response) {
    alertStore.setErrorWithoutPageRefresh(t('routine.deleteFailed'))
    return
  }

  alertStore.setSuccess(t('routine.deleted'))
  await router.push('/routines')
}
</script>

<template>
  <AppSkeleton v-if="loading" />
  <div v-else-if="routine" class="routine-detail">
    <section class="routine-hero">
      <div>
        <span v-if="routine.id === dashboardStore.preferredRoutineId" class="status-pill">{{
          t('home.upNext')
        }}</span>
        <p class="summary">
          <ClockIcon /> {{ t('home.exerciseCount', routine.exercises.length) }} ·
          {{ t('home.aboutMinutes', { count: Math.max(30, routine.exercises.length * 8) }) }}
        </p>
      </div>
      <div class="hero-actions">
        <RouterLink :to="`/workouts/routine/${routine.id}`" class="start-button">
          <PlayIcon /> {{ t('workout.start') }}
        </RouterLink>
        <button
          v-if="routine.id !== dashboardStore.preferredRoutineId"
          type="button"
          class="next-button"
          @click="makeUpNext"
        >
          <StarIcon /> {{ t('routine.makeUpNext') }}
        </button>
      </div>
    </section>

    <section class="exercise-section">
      <div class="section-heading">
        <div>
          <h2>{{ t('routine.view.orderTitle') }}</h2>
          <p>{{ t('routine.view.orderHelp') }}</p>
        </div>
        <RouterLink :to="`/routines/${routine.id}/edit`"
          ><PencilIcon /> {{ t('routine.view.editExercises') }}</RouterLink
        >
      </div>
      <ol ref="listElement" class="exercise-list">
        <li
          v-for="(exercise, index) in routine.exercises"
          :key="exercise.id"
          :data-id="exercise.id"
        >
          <span class="number">{{ index + 1 }}</span>
          <span class="exercise-copy">
            <strong>{{ exercise.name }}</strong>
            <small v-if="lastSession(exercise.id)">{{ lastSession(exercise.id) }}</small>
            <ExerciseTags v-else compact :tags="exercise.tags" />
          </span>
          <button type="button" class="drag-handle" :aria-label="t('routine.view.reorderAria')">
            <Bars3Icon />
          </button>
        </li>
      </ol>
    </section>

    <section class="danger-zone">
      <div>
        <h2>{{ t('routine.view.deleteTitle') }}</h2>
        <p>{{ t('routine.view.deleteBody') }}</p>
      </div>
      <button type="button" @click="onDeleteRoutine"><TrashIcon /> {{ t('common.delete') }}</button>
    </section>
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.routine-detail {
  @apply mx-auto max-w-4xl space-y-5;
}
/* An ordinary card. The inverse surface is reserved for the single next action
   on a screen, and a routine header is a page title, not an action. */
.routine-hero {
  @apply card flex flex-col gap-4 overflow-hidden p-5 sm:flex-row sm:items-center sm:justify-between md:p-6;
}
.status-pill {
  @apply mb-3 inline-flex rounded-full bg-success-surface px-3 py-1 text-xs font-semibold text-success;
}
.summary {
  @apply flex items-center gap-2 text-sm text-text-muted;
}
.summary svg {
  @apply size-4;
}
.hero-actions {
  @apply flex shrink-0 flex-wrap gap-2;
}
.hero-actions a,
.hero-actions button {
  @apply inline-flex min-h-(--size-control) items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold;
}
.hero-actions svg {
  @apply size-5;
}
.start-button {
  @apply bg-ink text-white transition hover:brightness-125;
}
.next-button {
  @apply border border-border text-text-muted transition hover:bg-surface-sunken hover:text-text;
}
.exercise-section,
.danger-zone {
  @apply card p-5;
}
.section-heading {
  @apply mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between;
}
.section-heading h2,
.danger-zone h2 {
  @apply text-title font-semibold text-text;
}
.section-heading p,
.danger-zone p {
  @apply mt-1 text-sm text-text-subtle;
}
.section-heading a {
  @apply inline-flex min-h-(--size-control-sm) w-max items-center gap-2 rounded-control px-3 text-sm font-semibold text-ink-strong hover:bg-ink-surface;
}
.section-heading svg {
  @apply size-4;
}
.exercise-list {
  @apply divide-y divide-border overflow-hidden rounded-control border border-border;
}
.exercise-list li {
  @apply flex min-h-14 items-center gap-3 bg-white px-4 py-2.5;
}
.number {
  @apply grid size-8 shrink-0 place-items-center rounded-lg bg-info-surface text-sm font-semibold text-text-muted;
}
.exercise-copy {
  @apply min-w-0 flex-1;
}
.exercise-copy strong {
  @apply block text-sm font-semibold text-text;
}
.exercise-copy small {
  @apply mt-0.5 block text-meta tabular-nums text-text-muted;
}
.drag-handle {
  @apply grid size-11 cursor-grab place-items-center rounded-lg text-text-subtle hover:bg-ink-tint active:cursor-grabbing;
}
.drag-handle svg {
  @apply size-5;
}
.sortable-ghost {
  @apply opacity-30;
}
.sortable-drag {
  @apply rounded-control border border-ink-border shadow-raised;
}
.danger-zone {
  @apply flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between;
}
.danger-zone button {
  @apply inline-flex min-h-(--size-control-sm) w-max items-center gap-2 rounded-control border border-danger/30 px-4 text-sm font-semibold text-danger hover:bg-danger-surface hover:text-danger-strong;
}
.danger-zone svg {
  @apply size-5;
}
</style>
