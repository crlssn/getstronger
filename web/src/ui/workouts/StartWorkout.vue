<script setup lang="ts">
import { ExerciseSetsSchema, type ExerciseSets } from '@/proto/api/v1/shared_pb'
import type { Routine } from '@/proto/api/v1/routine_service_pb'
import type { Set } from '@/types/workout'

import { DateTime } from 'luxon'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import router from '@/router/router'
import { create } from '@bufbuild/protobuf'
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  FlagIcon,
  MinusIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'
import { useTextareaAutosize } from '@vueuse/core'

import { useAlertStore } from '@/stores/alerts'
import { useWorkoutStore } from '@/stores/workout'
import { usePageTitleStore } from '@/stores/pageTitle'
import { createWorkout, getPreviousWorkoutSets, getRoutine } from '@/http/requests'
import { isNumber } from '@/utils/numbers'

const { input: note, textarea } = useTextareaAutosize()
const route = useRoute()
const routineID = route.params.routine_id as string
const routine = ref<Routine>()
const prevExerciseSets = ref<ExerciseSets[]>([])
const startedAt = ref(DateTime.now())
const elapsedSeconds = ref(0)
const restSeconds = ref(0)
const completedSets = ref<Record<string, boolean>>({})
const submitting = ref(false)
const finishError = ref('')

const workoutStore = useWorkoutStore()
const alertStore = useAlertStore()
const pageTitleStore = usePageTitleStore()

watch(note, (value) => workoutStore.setNote(routineID, value))

let elapsedInterval: ReturnType<typeof setInterval>
let restInterval: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  await initializeRoutine()
  elapsedInterval = setInterval(() => {
    elapsedSeconds.value = Math.floor(DateTime.now().diff(startedAt.value, 'seconds').seconds)
  }, 1000)
})

onUnmounted(() => {
  clearInterval(elapsedInterval)
  if (restInterval) clearInterval(restInterval)
})

const maxExerciseIndex = computed(() => (routine.value?.exercises.length ?? 1) - 1)
const completedSetCount = computed(() => Object.values(completedSets.value).filter(Boolean).length)
const isCompleteSet = (set: Set) =>
  isNumber(set.weight) &&
  isNumber(set.reps) &&
  Number.isInteger(set.reps) &&
  (set.reps as number) > 0
const hasEnteredValue = (value: unknown) =>
  value !== undefined &&
  value !== null &&
  (typeof value !== 'string' || value.trim().length > 0)

const loggedSetCount = computed(() => {
  if (!routine.value) return 0
  return routine.value.exercises.reduce(
    (total, exercise) =>
      total + workoutStore.getSets(routineID, exercise.id).filter(isCompleteSet).length,
    0,
  )
})
const incompleteSetCount = computed(() => {
  if (!routine.value) return 0
  return routine.value.exercises.reduce(
    (total, exercise) =>
      total +
      workoutStore
        .getSets(routineID, exercise.id)
        .filter(
          (set) =>
            (hasEnteredValue(set.weight) || hasEnteredValue(set.reps)) && !isCompleteSet(set),
        ).length,
    0,
  )
})
const canFinish = computed(
  () =>
    Boolean(routine.value?.exercises.length) &&
    loggedSetCount.value > 0 &&
    incompleteSetCount.value === 0 &&
    !submitting.value,
)
const finishStatus = computed(() => {
  if (!routine.value) return 'Loading routine…'
  if (!routine.value.exercises.length) return 'This routine has no exercises'
  if (incompleteSetCount.value > 0) {
    return `Complete ${incompleteSetCount.value} partial ${incompleteSetCount.value === 1 ? 'set' : 'sets'}`
  }
  if (!loggedSetCount.value) return 'Log at least one set to finish'
  return `${loggedSetCount.value} ${loggedSetCount.value === 1 ? 'set' : 'sets'} ready`
})

const elapsedLabel = computed(() => formatTimer(elapsedSeconds.value))
const restLabel = computed(() => formatTimer(restSeconds.value))

const formatTimer = (seconds: number) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remainder = (seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${remainder}`
}

const initializeRoutine = async () => {
  const response = await getRoutine(routineID)
  if (!response?.routine) {
    await router.push('/routines')
    return
  }

  routine.value = response.routine
  pageTitleStore.setPageTitle(response.routine.name)
  workoutStore.initialiseWorkout(routineID)
  const savedStartedAt = workoutStore.getStartedAt(routineID)
  if (savedStartedAt) {
    const parsedStartedAt = DateTime.fromISO(savedStartedAt)
    if (parsedStartedAt.isValid) startedAt.value = parsedStartedAt
  }
  note.value = workoutStore.getNote(routineID)

  const previousResponse = await getPreviousWorkoutSets(response.routine.exercises.map((exercise) => exercise.id))
  if (previousResponse) prevExerciseSets.value = previousResponse.exerciseSets
  addEmptySetsFromPreviousSession()
}

const addEmptySetsFromPreviousSession = () => {
  routine.value?.exercises.forEach((exercise) => workoutStore.addEmptySetIfNone(routineID, exercise.id))

  prevExerciseSets.value.forEach((exerciseSets) => {
    if (!exerciseSets.exercise) return
    const currentLength = workoutStore.getSets(routineID, exerciseSets.exercise.id).length
    for (let index = currentLength; index < exerciseSets.sets.length; index += 1) {
      workoutStore.addEmptySet(routineID, exerciseSets.exercise.id)
    }
  })
}

const previousSet = (exerciseID: string, index: number) =>
  prevExerciseSets.value.find((entry) => entry.exercise?.id === exerciseID)?.sets[index]

const copyPreviousValue = (event: Event, exerciseId: string, set: Set, index: number, field: 'weight' | 'reps') => {
  if (isNumber(set[field])) return
  const previous = previousSet(exerciseId, index) ?? workoutStore.getSets(routineID, exerciseId)[index - 1]
  if (!previous) return

  set[field] = previous[field]
  ;(event.target as HTMLInputElement).select()
  workoutStore.addEmptySetIfNone(routineID, exerciseId)
}

const setKey = (exerciseID: string, index: number) => `${exerciseID}:${index}`

const toggleSetComplete = (exerciseID: string, set: Set, index: number) => {
  if (!isCompleteSet(set)) return
  const key = setKey(exerciseID, index)
  completedSets.value[key] = !completedSets.value[key]
  if (completedSets.value[key]) startRestTimer()
}

const startRestTimer = (seconds = 90) => {
  if (restInterval) clearInterval(restInterval)
  restSeconds.value = seconds
  restInterval = setInterval(() => {
    restSeconds.value -= 1
    if (restSeconds.value <= 0 && restInterval) {
      clearInterval(restInterval)
      restInterval = undefined
    }
  }, 1000)
}

const skipRest = () => {
  if (restInterval) clearInterval(restInterval)
  restInterval = undefined
  restSeconds.value = 0
}

const buildWorkoutSets = () => {
  const allSets = workoutStore.getAllSets(routineID)
  if (!allSets) return []

  return (routine.value?.exercises ?? [])
    .map((exercise) => {
      const sets = allSets[exercise.id]?.filter(isCompleteSet)
      if (!sets?.length) return null

      return create(ExerciseSetsSchema, {
        exercise: { id: exercise.id },
        sets: sets.map((set) => ({
          reps: set.reps as number,
          weight: set.weight as number,
        })),
      })
    })
    .filter(Boolean) as ExerciseSets[]
}

const onFinishWorkout = async () => {
  finishError.value = ''
  if (!canFinish.value) {
    finishError.value = finishStatus.value
    return
  }

  const exerciseSets = buildWorkoutSets()
  if (!exerciseSets.length) {
    finishError.value = 'Log at least one complete set before finishing'
    return
  }

  submitting.value = true
  try {
    const response = await createWorkout(
      routineID,
      exerciseSets,
      startedAt.value,
      DateTime.now(),
      note.value,
    )
    if (!response) {
      finishError.value = 'Workout could not be saved. Check your connection and try again.'
      return
    }

    workoutStore.removeWorkout(routineID)
    alertStore.setSuccess('Workout saved')
    await router.push('/progress')
  } catch (error) {
    console.error('failed to finish workout', error)
    finishError.value = 'Workout could not be saved. Check your connection and try again.'
  } finally {
    submitting.value = false
  }
}

const cancelWorkout = async () => {
  if (!confirm('Cancel this workout and discard the sets you entered?')) return
  workoutStore.removeWorkout(routineID)
  await router.push(`/routines/${routineID}`)
}

const moveExercise = (index: number, direction: 'up' | 'down') => {
  const exercises = routine.value?.exercises
  if (!exercises) return
  const newIndex = direction === 'up' ? index - 1 : index + 1
  if (newIndex < 0 || newIndex >= exercises.length) return
  ;[exercises[index], exercises[newIndex]] = [exercises[newIndex], exercises[index]]
}
</script>

<template>
  <form class="workout-shell" novalidate @submit.prevent="onFinishWorkout">
    <header class="workout-header">
      <button type="button" class="icon-button" aria-label="Cancel workout" @click="cancelWorkout"><XMarkIcon /></button>
      <div>
        <p class="eyebrow">Active workout</p>
        <h1>{{ routine?.name ?? 'Loading workout' }}</h1>
        <p>{{ completedSetCount }} completed · {{ loggedSetCount }} logged</p>
      </div>
      <strong class="elapsed">{{ elapsedLabel }}</strong>
    </header>

    <section v-if="restSeconds > 0" class="rest-banner" aria-live="polite">
      <ClockIcon />
      <div><strong>Rest timer</strong><p>{{ restLabel }} remaining</p></div>
      <button type="button" @click="skipRest">Skip</button>
    </section>

    <main class="exercise-stack">
      <section v-for="(exercise, exerciseIndex) in routine?.exercises" :key="exercise.id" class="exercise-card">
        <header class="exercise-heading">
          <div><p class="eyebrow">Exercise {{ exerciseIndex + 1 }} of {{ routine?.exercises.length }}</p><h2>{{ exercise.name }}</h2><p v-if="exercise.label">{{ exercise.label }}</p></div>
          <div class="reorder-actions">
            <button v-if="exerciseIndex > 0" type="button" aria-label="Move exercise up" @click="moveExercise(exerciseIndex, 'up')"><ChevronUpIcon /></button>
            <button v-if="exerciseIndex < maxExerciseIndex" type="button" aria-label="Move exercise down" @click="moveExercise(exerciseIndex, 'down')"><ChevronDownIcon /></button>
          </div>
        </header>

        <div class="set-grid set-labels" aria-hidden="true">
          <span>Set</span><span>Previous</span><span>kg</span><span>Reps</span><span></span>
        </div>
        <div
          v-for="(set, setIndex) in workoutStore.getSets(routineID, exercise.id)"
          :key="setIndex"
          class="set-grid set-row"
          :class="{ complete: completedSets[setKey(exercise.id, setIndex)] }"
        >
          <span class="set-number">{{ setIndex + 1 }}</span>
          <span class="previous-value">
            <template v-if="previousSet(exercise.id, setIndex)">
              {{ previousSet(exercise.id, setIndex)?.weight }} × {{ previousSet(exercise.id, setIndex)?.reps }}
            </template>
            <span v-else>—</span>
          </span>
          <input
            v-model.number="set.weight"
            type="text"
            inputmode="decimal"
            :aria-label="`${exercise.name} set ${setIndex + 1} weight`"
            @input="finishError = ''; workoutStore.addEmptySetIfNone(routineID, exercise.id)"
            @focus="copyPreviousValue($event, exercise.id, set, setIndex, 'weight')"
          />
          <input
            v-model.number="set.reps"
            type="text"
            inputmode="numeric"
            :aria-label="`${exercise.name} set ${setIndex + 1} repetitions`"
            @input="finishError = ''; workoutStore.addEmptySetIfNone(routineID, exercise.id)"
            @focus="copyPreviousValue($event, exercise.id, set, setIndex, 'reps')"
          />
          <button
            type="button"
            class="complete-button"
            :aria-pressed="completedSets[setKey(exercise.id, setIndex)] ?? false"
            :aria-label="`Complete ${exercise.name} set ${setIndex + 1}`"
            @click="toggleSetComplete(exercise.id, set, setIndex)"
          ><CheckIcon /></button>
          <button type="button" class="remove-set" :aria-label="`Remove set ${setIndex + 1}`" @click="workoutStore.deleteSet(routineID, exercise.id, setIndex)"><MinusIcon /></button>
        </div>

        <button type="button" class="add-set" @click="workoutStore.addEmptySet(routineID, exercise.id)"><PlusIcon /> Add set</button>
      </section>

      <section class="note-card">
        <label for="workout-note">Workout note <span>Optional</span></label>
        <textarea id="workout-note" ref="textarea" v-model="note" placeholder="How did the session feel?"></textarea>
      </section>
    </main>

    <footer class="finish-dock">
      <div>
        <strong :class="{ 'text-red-600': finishError }">{{ finishError || finishStatus }}</strong>
        <p>Started {{ startedAt.toFormat('HH:mm') }}</p>
      </div>
      <button type="submit" :disabled="!canFinish">
        <FlagIcon /> {{ submitting ? 'Saving…' : 'Finish workout' }}
      </button>
    </footer>
  </form>
</template>

<style scoped>
.workout-shell { @apply mx-auto max-w-4xl space-y-4 pb-24; }
.workout-header { @apply grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm; }
.icon-button { @apply grid size-11 place-items-center rounded-xl border border-slate-200 text-slate-600; }
.icon-button svg { @apply size-5; }
.eyebrow { @apply text-xs font-semibold uppercase tracking-wider text-slate-500; }
.workout-header h1 { @apply text-xl font-semibold tracking-tight text-slate-950; }
.workout-header p:last-child { @apply mt-0.5 text-sm text-slate-500; }
.elapsed { @apply rounded-xl bg-indigo-50 px-3 py-2 font-mono text-sm text-indigo-700; }
.rest-banner { @apply grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl bg-indigo-50 p-4 text-indigo-900; }
.rest-banner > svg { @apply size-6; }
.rest-banner p { @apply text-sm text-indigo-700; }
.rest-banner button { @apply rounded-xl px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-white; }
.exercise-stack { @apply space-y-4; }
.exercise-card, .note-card { @apply rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5; }
.exercise-heading { @apply mb-4 flex items-start justify-between gap-3; }
.exercise-heading h2 { @apply mt-1 text-xl font-semibold tracking-tight; }
.exercise-heading p:last-child { @apply mt-1 text-sm text-slate-500; }
.reorder-actions { @apply flex items-center gap-1; }
.reorder-actions button { @apply grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100; }
.reorder-actions svg { @apply size-5; }
.set-grid { @apply grid grid-cols-[2rem_minmax(3.4rem,1fr)_4.5rem_4rem_2.5rem] items-center gap-2; }
.set-labels { @apply pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500; }
.set-row { @apply relative border-t border-slate-100 py-2; }
.set-row.complete { @apply text-emerald-700; }
.set-number { @apply text-center text-sm font-semibold; }
.previous-value { @apply truncate text-sm text-slate-500; }
.set-row input { @apply min-w-0 rounded-xl border-slate-200 px-2 py-2 text-center font-semibold shadow-sm focus:border-indigo-500 focus:ring-indigo-500; }
.complete-button { @apply grid size-9 place-items-center rounded-full border border-slate-300 text-slate-400 transition; }
.complete-button svg { @apply size-5; }
.complete-button[aria-pressed='true'] { @apply border-emerald-600 bg-emerald-50 text-emerald-700; }
.remove-set { @apply absolute -right-2 -top-1 grid size-6 place-items-center rounded-full bg-slate-100 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600; }
.set-row:hover .remove-set, .remove-set:focus-visible { @apply opacity-100; }
.remove-set svg { @apply size-4; }
.add-set { @apply mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50; }
.add-set svg { @apply size-4; }
.note-card label { @apply flex items-center justify-between text-sm font-semibold text-slate-900; }
.note-card label span { @apply font-normal text-slate-500; }
.note-card textarea { @apply mt-3 min-h-24 w-full resize-none rounded-xl border-slate-200 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:ring-indigo-500; }
.finish-dock { @apply fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-4xl items-center justify-between gap-4 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:bottom-4 sm:rounded-2xl sm:border; }
.finish-dock p { @apply text-sm text-slate-500; }
.finish-dock > button { @apply inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300; }
.finish-dock svg { @apply size-5; }
@media (max-width: 520px) {
  .workout-header { @apply grid-cols-[auto_1fr]; }
  .elapsed { @apply col-start-2 row-start-2 w-max; }
  .set-grid { @apply grid-cols-[1.5rem_minmax(2.8rem,1fr)_3.8rem_3.4rem_2.25rem] gap-1.5; }
  .set-labels { @apply text-[0.65rem]; }
  .set-row input { @apply px-1; }
  .finish-dock { @apply flex-col items-stretch gap-2; }
  .finish-dock > div { @apply text-center; }
  .finish-dock > div p { @apply hidden; }
  .finish-dock > button { @apply w-full; }
}
</style>
