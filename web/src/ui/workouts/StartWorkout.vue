<script setup lang="ts">
import { ExerciseSetsSchema, type Exercise, type ExerciseSets } from '@/proto/api/v1/shared_pb'
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
  MagnifyingGlassIcon,
  MinusIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'
import { useTextareaAutosize } from '@vueuse/core'

import { useAlertStore } from '@/stores/alerts'
import { useWorkoutStore } from '@/stores/workout'
import { usePageTitleStore } from '@/stores/pageTitle'
import { createWorkout, getPreviousWorkoutSets, getRoutine, listExercises } from '@/http/requests'
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
const completedExercises = ref<Record<string, boolean>>({})
const submitting = ref(false)
const finishError = ref('')
const exercisePickerOpen = ref(false)
const exercisePickerLoading = ref(false)
const exerciseOptionsLoaded = ref(false)
const exerciseOptions = ref<Exercise[]>([])
const exerciseSearch = ref('')
const exercisePageToken = ref(new Uint8Array(0))

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
const availableExercises = computed(() => {
  const currentExerciseIds = new Set(routine.value?.exercises.map((exercise) => exercise.id) ?? [])
  const query = exerciseSearch.value.trim().toLowerCase()
  return exerciseOptions.value.filter(
    (exercise) =>
      !currentExerciseIds.has(exercise.id) &&
      (!query || `${exercise.name} ${exercise.label}`.toLowerCase().includes(query)),
  )
})
const hasMoreExercises = computed(() => exercisePageToken.value.length > 0)
const completedExerciseCount = computed(
  () => Object.values(completedExercises.value).filter(Boolean).length,
)
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
  return ''
})

const elapsedLabel = computed(() => formatDuration(elapsedSeconds.value))
const restLabel = computed(() => formatTimer(restSeconds.value))

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return [hours > 0 ? `${hours}h` : '', hours > 0 || minutes > 0 ? `${minutes}m` : '', `${remainder}s`]
    .filter(Boolean)
    .join(' ')
}

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
  workoutStore.getAddedExercises(routineID).forEach((exercise) => {
    if (!response.routine?.exercises.some((entry) => entry.id === exercise.id)) {
      response.routine?.exercises.push(exercise)
    }
  })
  const savedStartedAt = workoutStore.getStartedAt(routineID)
  if (savedStartedAt) {
    const parsedStartedAt = DateTime.fromISO(savedStartedAt)
    if (parsedStartedAt.isValid) startedAt.value = parsedStartedAt
  }
  note.value = workoutStore.getNote(routineID)

  const previousResponse = await getPreviousWorkoutSets(response.routine.exercises.map((exercise) => exercise.id))
  if (previousResponse) prevExerciseSets.value = previousResponse.exerciseSets
  addEmptySetsFromPreviousSession()
  seedCompletedSets()
  workoutStore.getCompletedExerciseIds(routineID).forEach((exerciseId) => {
    if (canCompleteExercise(exerciseId)) completedExercises.value[exerciseId] = true
  })
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

const setKey = (exerciseID: string, index: number) => `${exerciseID}:${index}`

const seedCompletedSets = () => {
  routine.value?.exercises.forEach((exercise) => {
    workoutStore.getSets(routineID, exercise.id).forEach((set, index) => {
      if (isCompleteSet(set)) completedSets.value[setKey(exercise.id, index)] = true
    })
  })
}

const syncSetCompletion = (exerciseID: string, set: Set, index: number) => {
  const key = setKey(exerciseID, index)
  if (isCompleteSet(set)) {
    if (!completedSets.value[key]) {
      completedSets.value[key] = true
      startRestTimer()
    }
    return
  }

  delete completedSets.value[key]
}

const onSetInput = (exerciseID: string, set: Set, index: number) => {
  finishError.value = ''
  workoutStore.addEmptySetIfNone(routineID, exerciseID)
  syncSetCompletion(exerciseID, set, index)
}

const copyPreviousValue = (event: Event, exerciseId: string, set: Set, index: number, field: 'weight' | 'reps') => {
  if (isNumber(set[field])) return
  const previous = previousSet(exerciseId, index) ?? workoutStore.getSets(routineID, exerciseId)[index - 1]
  if (!previous) return

  set[field] = previous[field]
  ;(event.target as HTMLInputElement).select()
  workoutStore.addEmptySetIfNone(routineID, exerciseId)
  syncSetCompletion(exerciseId, set, index)
}

const deleteWorkoutSet = (exerciseID: string, index: number) => {
  workoutStore.deleteSet(routineID, exerciseID, index)
  Object.keys(completedSets.value)
    .filter((key) => key.startsWith(`${exerciseID}:`))
    .forEach((key) => delete completedSets.value[key])
  workoutStore.getSets(routineID, exerciseID).forEach((set, setIndex) => {
    if (isCompleteSet(set)) completedSets.value[setKey(exerciseID, setIndex)] = true
  })
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

const exerciseLoggedSetCount = (exerciseID: string) =>
  workoutStore.getSets(routineID, exerciseID).filter(isCompleteSet).length

const exerciseHasIncompleteSets = (exerciseID: string) =>
  workoutStore.getSets(routineID, exerciseID).some(
    (set) =>
      (hasEnteredValue(set.weight) || hasEnteredValue(set.reps)) && !isCompleteSet(set),
  )

const canCompleteExercise = (exerciseID: string) =>
  exerciseLoggedSetCount(exerciseID) > 0 && !exerciseHasIncompleteSets(exerciseID)

const completeExercise = (exerciseID: string) => {
  if (!canCompleteExercise(exerciseID)) return
  completedExercises.value[exerciseID] = true
  workoutStore.setExerciseCompleted(routineID, exerciseID, true)
}

const reopenExercise = (exerciseID: string) => {
  completedExercises.value[exerciseID] = false
  workoutStore.setExerciseCompleted(routineID, exerciseID, false)
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
    await router.push(`/workouts/${response.workoutId}`)
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
  await router.push('/home')
}

const loadExerciseOptions = async () => {
  exercisePickerLoading.value = true
  try {
    const response = await listExercises(exercisePageToken.value)
    if (!response) return

    const existingIds = new Set(exerciseOptions.value.map((exercise) => exercise.id))
    exerciseOptions.value.push(
      ...response.exercises.filter((exercise) => !existingIds.has(exercise.id)),
    )
    exercisePageToken.value = response.pagination?.nextPageToken ?? new Uint8Array(0)
    exerciseOptionsLoaded.value = true
  } finally {
    exercisePickerLoading.value = false
  }
}

const openExercisePicker = async () => {
  exercisePickerOpen.value = true
  if (!exerciseOptionsLoaded.value) await loadExerciseOptions()
}

const closeExercisePicker = () => {
  exercisePickerOpen.value = false
  exerciseSearch.value = ''
}

const addExerciseToWorkout = async (exercise: Exercise) => {
  if (!routine.value || routine.value.exercises.some((entry) => entry.id === exercise.id)) return

  routine.value.exercises.push(exercise)
  workoutStore.addWorkoutExercise(routineID, exercise)
  workoutStore.addEmptySetIfNone(routineID, exercise.id)
  closeExercisePicker()

  const previousResponse = await getPreviousWorkoutSets([exercise.id])
  if (previousResponse) {
    prevExerciseSets.value.push(...previousResponse.exerciseSets)
    addEmptySetsFromPreviousSession()
  }
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
      <div>
        <p class="eyebrow">Active workout</p>
        <h1>{{ routine?.name ?? 'Loading workout' }}</h1>
        <p>
          {{ completedExerciseCount }} {{ completedExerciseCount === 1 ? 'exercise' : 'exercises' }} completed
          · {{ loggedSetCount }} {{ loggedSetCount === 1 ? 'set' : 'sets' }} logged
        </p>
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
            <span>Reorder</span>
            <div>
              <button v-if="exerciseIndex > 0" type="button" aria-label="Move exercise up" @click="moveExercise(exerciseIndex, 'up')"><ChevronUpIcon /></button>
              <button v-if="exerciseIndex < maxExerciseIndex" type="button" aria-label="Move exercise down" @click="moveExercise(exerciseIndex, 'down')"><ChevronDownIcon /></button>
            </div>
          </div>
        </header>

        <div v-if="completedExercises[exercise.id]" class="completed-exercise">
          <span class="completed-icon"><CheckIcon /></span>
          <div>
            <strong>Exercise completed</strong>
            <p>{{ exerciseLoggedSetCount(exercise.id) }} {{ exerciseLoggedSetCount(exercise.id) === 1 ? 'set' : 'sets' }} logged</p>
          </div>
          <button type="button" @click="reopenExercise(exercise.id)">Reopen</button>
        </div>

        <template v-else>
          <div class="set-grid set-labels" aria-hidden="true">
            <span>Set</span><span>Previous</span><span>kg</span><span>Reps</span>
          </div>
          <div
            v-for="(set, setIndex) in workoutStore.getSets(routineID, exercise.id)"
            :key="setIndex"
            class="set-grid set-row"
            :class="{ complete: isCompleteSet(set) }"
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
              @input="onSetInput(exercise.id, set, setIndex)"
              @focus="copyPreviousValue($event, exercise.id, set, setIndex, 'weight')"
            />
            <input
              v-model.number="set.reps"
              type="text"
              inputmode="numeric"
              :aria-label="`${exercise.name} set ${setIndex + 1} repetitions`"
              @input="onSetInput(exercise.id, set, setIndex)"
              @focus="copyPreviousValue($event, exercise.id, set, setIndex, 'reps')"
            />
            <button type="button" class="remove-set" :aria-label="`Remove set ${setIndex + 1}`" @click="deleteWorkoutSet(exercise.id, setIndex)"><MinusIcon /></button>
          </div>

          <button
            type="button"
            class="complete-exercise-button"
            :disabled="!canCompleteExercise(exercise.id)"
            @click="completeExercise(exercise.id)"
          >
            <CheckIcon /> Complete exercise
          </button>
        </template>
      </section>

      <button type="button" class="add-exercise" @click="openExercisePicker">
        <PlusIcon />
        <span><strong>Add exercise</strong><small>Only for this workout</small></span>
      </button>

      <section class="note-card">
        <label for="workout-note">Workout note <span>Optional</span></label>
        <textarea id="workout-note" ref="textarea" v-model="note" placeholder="How did the session feel?"></textarea>
      </section>
    </main>

    <div v-if="exercisePickerOpen" class="picker-backdrop" @click.self="closeExercisePicker">
      <section class="exercise-picker" role="dialog" aria-modal="true" aria-labelledby="exercise-picker-title">
        <header>
          <div>
            <p class="eyebrow">Workout only</p>
            <h2 id="exercise-picker-title">Add an exercise</h2>
          </div>
          <button type="button" aria-label="Close exercise picker" @click="closeExercisePicker"><XMarkIcon /></button>
        </header>

        <label class="exercise-search">
          <MagnifyingGlassIcon />
          <input v-model="exerciseSearch" type="search" placeholder="Search exercises" aria-label="Search exercises" />
        </label>

        <div v-if="exercisePickerLoading && !exerciseOptionsLoaded" class="picker-empty">Loading exercises…</div>
        <div v-else-if="availableExercises.length" class="exercise-options">
          <button
            v-for="exercise in availableExercises"
            :key="exercise.id"
            type="button"
            @click="addExerciseToWorkout(exercise)"
          >
            <span class="min-w-0"><strong>{{ exercise.name }}</strong><small v-if="exercise.label">{{ exercise.label }}</small></span>
            <PlusIcon />
          </button>
        </div>
        <div v-else class="picker-empty">
          {{ exerciseSearch ? 'No exercises match your search.' : 'All available exercises are already in this workout.' }}
        </div>

        <button v-if="hasMoreExercises" type="button" class="load-more" :disabled="exercisePickerLoading" @click="loadExerciseOptions">
          {{ exercisePickerLoading ? 'Loading…' : 'Load more exercises' }}
        </button>
      </section>
    </div>

    <footer class="finish-dock">
      <strong v-if="finishError || finishStatus" :class="{ 'text-red-600': finishError }">{{ finishError || finishStatus }}</strong>
      <div class="finish-actions">
        <button type="button" class="cancel-workout" aria-label="Cancel workout" @click="cancelWorkout">
          <XMarkIcon />
        </button>
        <button type="submit" class="finish-workout" :disabled="!canFinish">
          <FlagIcon /> {{ submitting ? 'Saving…' : 'Finish workout' }}
        </button>
      </div>
    </footer>
  </form>
</template>

<style scoped>
.workout-shell { @apply mx-auto max-w-4xl space-y-4 pb-24; }
.workout-header { @apply grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm; }
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
.reorder-actions { @apply flex flex-col items-end gap-1; }
.reorder-actions > span { @apply text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400; }
.reorder-actions > div { @apply flex items-center gap-1; }
.reorder-actions button { @apply grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700; }
.reorder-actions svg { @apply size-5; }
.set-grid { @apply grid grid-cols-[2rem_minmax(3.4rem,1fr)_4.5rem_4rem] items-center gap-2; }
.set-labels { @apply pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500; }
.set-row { @apply relative border-t border-slate-100 py-2; }
.set-row.complete { @apply text-emerald-700; }
.set-number { @apply text-center text-sm font-semibold; }
.previous-value { @apply truncate text-sm text-slate-500; }
.set-row input { @apply min-w-0 rounded-xl border-slate-200 px-2 py-2 text-center font-semibold shadow-sm focus:border-indigo-500 focus:ring-indigo-500; }
.remove-set { @apply absolute -right-2 -top-1 grid size-6 place-items-center rounded-full bg-slate-100 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600; }
.set-row:hover .remove-set, .remove-set:focus-visible { @apply opacity-100; }
.remove-set svg { @apply size-4; }
.complete-exercise-button { @apply mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400; }
.complete-exercise-button svg { @apply size-5; }
.completed-exercise { @apply grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-800; }
.completed-icon { @apply grid size-9 place-items-center rounded-full bg-emerald-100; }
.completed-icon svg { @apply size-5; }
.completed-exercise strong { @apply text-sm font-semibold; }
.completed-exercise p { @apply mt-0.5 text-xs text-emerald-700; }
.completed-exercise button { @apply rounded-lg px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100; }
.add-exercise { @apply flex w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/50 p-4 text-left text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50; }
.add-exercise > svg { @apply size-5; }
.add-exercise strong, .add-exercise small { @apply block; }
.add-exercise strong { @apply text-sm font-semibold; }
.add-exercise small { @apply mt-0.5 text-xs text-indigo-500; }
.note-card label { @apply flex items-center justify-between text-sm font-semibold text-slate-900; }
.note-card label span { @apply font-normal text-slate-500; }
.note-card textarea { @apply mt-3 min-h-24 w-full resize-none rounded-xl border-slate-200 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:ring-indigo-500; }
.finish-dock { @apply fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-4xl flex-col items-stretch gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 text-center shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:bottom-4 sm:rounded-2xl sm:border; }
.finish-actions { @apply flex items-stretch gap-2; }
.cancel-workout { @apply grid size-12 shrink-0 place-items-center rounded-xl bg-slate-200 text-slate-700 transition hover:bg-slate-300; }
.finish-workout { @apply inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300; }
.finish-dock svg { @apply size-5; }
.picker-backdrop { @apply fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-6; }
.exercise-picker { @apply w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl; }
.exercise-picker header { @apply mb-4 flex items-center justify-between gap-4; }
.exercise-picker header h2 { @apply mt-1 text-xl font-semibold text-slate-950; }
.exercise-picker header button { @apply grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-500; }
.exercise-picker header button svg { @apply size-5; }
.exercise-search { @apply mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3; }
.exercise-search svg { @apply size-5 text-slate-400; }
.exercise-search input { @apply h-11 w-full border-0 bg-transparent p-0 text-sm focus:ring-0; }
.exercise-options { @apply max-h-80 space-y-2 overflow-y-auto; }
.exercise-options button { @apply flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50; }
.exercise-options strong, .exercise-options small { @apply block truncate; }
.exercise-options strong { @apply text-sm font-semibold text-slate-900; }
.exercise-options small { @apply mt-0.5 text-xs text-slate-500; }
.exercise-options button > svg { @apply size-5 shrink-0 text-indigo-600; }
.picker-empty { @apply rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500; }
.load-more { @apply mt-4 min-h-11 w-full rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:text-slate-400; }
@media (max-width: 520px) {
  .set-grid { @apply grid-cols-[1.5rem_minmax(2.8rem,1fr)_4.25rem_3.75rem] gap-1.5; }
  .set-labels { @apply text-[0.65rem]; }
  .set-row input { @apply px-1; }
}
</style>
