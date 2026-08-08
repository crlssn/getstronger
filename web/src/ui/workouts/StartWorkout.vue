<script setup lang="ts">
import { ExerciseSetsSchema, type Exercise, type ExerciseSets } from '@/proto/api/v1/shared_pb'
import { RoutineSchema, type Routine } from '@/proto/api/v1/routine_service_pb'
import type { Set } from '@/types/workout'

import { DateTime } from 'luxon'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import router from '@/router/router'
import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import {
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  FlagIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'
import { useTextareaAutosize } from '@vueuse/core'

import { useAlertStore } from '@/stores/alerts'
import { useWorkoutStore } from '@/stores/workout'
import { useDashboardStore } from '@/stores/dashboard'
import { usePageTitleStore } from '@/stores/pageTitle'
import { createWorkout, getPreviousWorkoutSets, getRoutine, listExercises } from '@/http/requests'
import { isNumber } from '@/utils/numbers'
import ExerciseTags from '@/ui/exercises/ExerciseTags.vue'

const { input: note, textarea } = useTextareaAutosize()
const route = useRoute()
const quickWorkout = route.name === 'quick-workout'
const routineID = quickWorkout ? 'quick-workout' : (route.params.routine_id as string)
const requestedPlanID = typeof route.query.plan_id === 'string' ? route.query.plan_id : ''
const routine = ref<Routine>()
const prevExerciseSets = ref<ExerciseSets[]>([])
const startedAt = ref(DateTime.now())
const elapsedSeconds = ref(0)
const restSeconds = ref(0)
const completedSets = ref<Record<string, boolean>>({})
const completedExercises = ref<Record<string, boolean>>({})
const activeExerciseIndex = ref(0)
const submitting = ref(false)
const savedWorkoutId = ref('')
const finishError = ref('')
const finishDialogOpen = ref(false)
const exercisePickerOpen = ref(false)
const leaveDialogOpen = ref(false)
const discardConfirmationOpen = ref(false)
const exercisePickerLoading = ref(false)
const exerciseOptionsLoaded = ref(false)
const exerciseOptions = ref<Exercise[]>([])
const exerciseSearch = ref('')
const exercisePageToken = ref(new Uint8Array(0))

const workoutStore = useWorkoutStore()
const dashboardStore = useDashboardStore()
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

const currentExercise = computed(() => routine.value?.exercises[activeExerciseIndex.value])
const exerciseQueue = computed(() =>
  (routine.value?.exercises ?? [])
    .map((exercise, index) => ({ exercise, index }))
    .filter(({ index }) => index !== activeExerciseIndex.value),
)
const availableExercises = computed(() => {
  const currentExerciseIds = new Set(routine.value?.exercises.map((exercise) => exercise.id) ?? [])
  const query = exerciseSearch.value.trim().toLowerCase()
  return exerciseOptions.value.filter(
    (exercise) =>
      !currentExerciseIds.has(exercise.id) &&
      (!query || [exercise.name, ...exercise.tags].join(' ').toLowerCase().includes(query)),
  )
})
const hasMoreExercises = computed(() => exercisePageToken.value.length > 0)
const completedExerciseCount = computed(
  () => Object.values(completedExercises.value).filter(Boolean).length,
)
const unfinishedExerciseCount = computed(
  () =>
    routine.value?.exercises.filter((exercise) => !completedExercises.value[exercise.id]).length ??
    0,
)
const nextIncompleteExerciseIndex = computed(() => {
  const exercises = routine.value?.exercises ?? []
  const afterCurrent = exercises.findIndex(
    (exercise, index) =>
      index > activeExerciseIndex.value && !completedExercises.value[exercise.id],
  )
  if (afterCurrent >= 0) return afterCurrent
  return exercises.findIndex((exercise) => !completedExercises.value[exercise.id])
})
const isCompleteSet = (set: Set) =>
  isNumber(set.weight) &&
  isNumber(set.reps) &&
  Number.isInteger(set.reps) &&
  (set.reps as number) > 0
const hasEnteredValue = (value: unknown) =>
  value !== undefined && value !== null && (typeof value !== 'string' || value.trim().length > 0)

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
  if (!routine.value.exercises.length) {
    return quickWorkout ? '' : 'This routine has no exercises'
  }
  if (incompleteSetCount.value > 0) {
    return `Complete ${incompleteSetCount.value} partial ${incompleteSetCount.value === 1 ? 'set' : 'sets'}`
  }
  if (!loggedSetCount.value) return 'Log at least one set to finish'
  return ''
})

const elapsedLabel = computed(() => formatDuration(elapsedSeconds.value))
const restLabel = computed(() => formatTimer(restSeconds.value))
const nextActionLabel = computed(() =>
  nextIncompleteExerciseIndex.value >= 0 &&
  nextIncompleteExerciseIndex.value !== activeExerciseIndex.value
    ? 'Next exercise'
    : 'Complete exercise',
)

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return [
    hours > 0 ? `${hours}h` : '',
    hours > 0 || minutes > 0 ? `${minutes}m` : '',
    `${remainder}s`,
  ]
    .filter(Boolean)
    .join(' ')
}

const formatTimer = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')
  const remainder = (seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${remainder}`
}

const initializeRoutine = async () => {
  if (quickWorkout) {
    routine.value = create(RoutineSchema, { name: 'Quick Workout', exercises: [] })
    pageTitleStore.setPageTitle('Quick Workout')
    workoutStore.initialiseWorkout(routineID)
    workoutStore
      .getAddedExercises(routineID)
      .forEach((exercise) => routine.value?.exercises.push(exercise))
    const savedStartedAt = workoutStore.getStartedAt(routineID)
    if (savedStartedAt) {
      const parsedStartedAt = DateTime.fromISO(savedStartedAt)
      if (parsedStartedAt.isValid) startedAt.value = parsedStartedAt
    }
    note.value = workoutStore.getNote(routineID)
    if (routine.value.exercises.length) {
      const previousResponse = await getPreviousWorkoutSets(
        routine.value.exercises.map((exercise) => exercise.id),
      )
      if (previousResponse) prevExerciseSets.value = previousResponse.exerciseSets
      addEmptySetsFromPreviousSession()
      seedCompletedSets()
    }
    return
  }

  const response = await getRoutine(routineID)
  if (!response?.routine) {
    await router.push('/routines')
    return
  }

  routine.value = response.routine
  pageTitleStore.setPageTitle(response.routine.name)
  workoutStore.initialiseWorkout(routineID, requestedPlanID)
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

  const previousResponse = await getPreviousWorkoutSets(
    response.routine.exercises.map((exercise) => exercise.id),
  )
  if (previousResponse) prevExerciseSets.value = previousResponse.exerciseSets
  addEmptySetsFromPreviousSession()
  seedCompletedSets()
  workoutStore.getCompletedExerciseIds(routineID).forEach((exerciseId) => {
    if (canCompleteExercise(exerciseId)) completedExercises.value[exerciseId] = true
  })
  const firstIncomplete = response.routine.exercises.findIndex(
    (exercise) => !completedExercises.value[exercise.id],
  )
  activeExerciseIndex.value = Math.max(0, firstIncomplete)
}

const addEmptySetsFromPreviousSession = () => {
  routine.value?.exercises.forEach((exercise) =>
    workoutStore.addEmptySetIfNone(routineID, exercise.id),
  )

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

const copyPreviousValue = async (
  event: Event,
  exerciseId: string,
  set: Set,
  index: number,
  field: 'weight' | 'reps',
) => {
  if (isNumber(set[field])) return
  const previous =
    previousSet(exerciseId, index) ?? workoutStore.getSets(routineID, exerciseId)[index - 1]
  if (!previous) return

  set[field] = previous[field]
  workoutStore.addEmptySetIfNone(routineID, exerciseId)
  syncSetCompletion(exerciseId, set, index)
  await nextTick()
  ;(event.target as HTMLInputElement).select()
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

let audioContext: AudioContext | undefined

// Create/resume the context during a user gesture so browser autoplay
// policies allow the beep when the timer later hits zero.
const prepareRestSound = () => {
  try {
    audioContext = audioContext ?? new AudioContext()
    if (audioContext.state === 'suspended') void audioContext.resume()
  } catch {
    audioContext = undefined
  }
}

const playRestFinishedSound = () => {
  const context = audioContext
  if (!context || context.state !== 'running') return

  try {
    const beep = (offset: number) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const start = context.currentTime + offset
      oscillator.type = 'sine'
      oscillator.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + 0.35)
    }
    beep(0)
    beep(0.4)
  } catch {
    // Sound is best-effort; never break the workout flow over it.
  }
}

const startRestTimer = (seconds = 90) => {
  if (restInterval) clearInterval(restInterval)
  prepareRestSound()
  restSeconds.value = seconds
  restInterval = setInterval(() => {
    restSeconds.value -= 1
    if (restSeconds.value <= 0 && restInterval) {
      clearInterval(restInterval)
      restInterval = undefined
      playRestFinishedSound()
    }
  }, 1000)
}

const skipRest = () => {
  if (restInterval) clearInterval(restInterval)
  restInterval = undefined
  restSeconds.value = 0
}

const addRestTime = () => {
  startRestTimer(restSeconds.value + 30)
}

const exerciseLoggedSetCount = (exerciseID: string) =>
  workoutStore.getSets(routineID, exerciseID).filter(isCompleteSet).length

const exerciseHasIncompleteSets = (exerciseID: string) =>
  workoutStore
    .getSets(routineID, exerciseID)
    .some(
      (set) => (hasEnteredValue(set.weight) || hasEnteredValue(set.reps)) && !isCompleteSet(set),
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

const selectExercise = (index: number) => {
  if (!routine.value?.exercises[index]) return
  activeExerciseIndex.value = index
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const advanceExercise = () => {
  const exercise = currentExercise.value
  if (!exercise || !canCompleteExercise(exercise.id)) return
  completeExercise(exercise.id)

  const nextIndex = routine.value?.exercises.findIndex(
    (entry, index) => index > activeExerciseIndex.value && !completedExercises.value[entry.id],
  )
  if (nextIndex !== undefined && nextIndex >= 0) {
    selectExercise(nextIndex)
    return
  }

  const firstIncomplete = routine.value?.exercises.findIndex(
    (entry) => !completedExercises.value[entry.id],
  )
  if (firstIncomplete !== undefined && firstIncomplete >= 0) selectExercise(firstIncomplete)
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

const openSavedWorkout = async (workoutId: string) => {
  const navigationFailure = await router.replace({
    name: 'view-workout',
    params: { id: workoutId },
  })
  if (navigationFailure) {
    finishError.value = 'Workout saved, but it could not be opened. Tap Finish workout to retry.'
    return false
  }

  workoutStore.removeWorkout(routineID)
  void dashboardStore.load()
  return true
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
    if (savedWorkoutId.value) {
      await openSavedWorkout(savedWorkoutId.value)
      return
    }

    const response = await createWorkout(
      quickWorkout ? '' : routineID,
      exerciseSets,
      startedAt.value,
      DateTime.now(),
      note.value,
      quickWorkout ? '' : workoutStore.getPlanId(routineID),
      quickWorkout ? 'Quick Workout' : '',
    )
    if (!response) {
      finishError.value = 'Workout could not be saved. Check your connection and try again.'
      return
    }

    const workoutId = response.workoutId.trim()
    if (!workoutId) {
      finishError.value = 'Workout was saved without an ID. Refresh your workouts to open it.'
      return
    }

    savedWorkoutId.value = workoutId
    alertStore.setSuccess('Workout saved')
    await openSavedWorkout(workoutId)
  } catch (error) {
    console.error('failed to finish workout', error)
    if (savedWorkoutId.value) {
      finishError.value = 'Workout saved, but it could not be opened. Tap Finish workout to retry.'
    } else if (
      quickWorkout &&
      error instanceof ConnectError &&
      error.code === Code.InvalidArgument &&
      error.message.includes('routine_id')
    ) {
      finishError.value = 'Restart the backend to enable Quick Workout, then try again.'
    } else if (error instanceof ConnectError && error.code === Code.DeadlineExceeded) {
      finishError.value = 'Saving took too long. Check your connection and try again.'
    } else {
      finishError.value = 'Workout could not be saved. Check your connection and try again.'
    }
  } finally {
    submitting.value = false
  }
}

const requestFinishWorkout = async () => {
  finishError.value = ''
  if (!canFinish.value) {
    finishError.value = finishStatus.value
    return
  }

  if (unfinishedExerciseCount.value > 0) {
    finishDialogOpen.value = true
    return
  }

  await onFinishWorkout()
}

const confirmFinishWorkout = async () => {
  finishDialogOpen.value = false
  await onFinishWorkout()
}

const cancelWorkout = () => {
  discardConfirmationOpen.value = false
  leaveDialogOpen.value = true
}

const saveAndLeave = async () => {
  discardConfirmationOpen.value = false
  leaveDialogOpen.value = false
  await router.push('/workout')
}

const closeLeaveDialog = () => {
  discardConfirmationOpen.value = false
  leaveDialogOpen.value = false
}

const discardWorkout = async () => {
  workoutStore.removeWorkout(routineID)
  discardConfirmationOpen.value = false
  leaveDialogOpen.value = false
  await router.push('/workout')
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
</script>

<template>
  <form class="workout-shell" novalidate @submit.prevent="requestFinishWorkout">
    <header class="workout-header">
      <div>
        <p class="eyebrow">{{ quickWorkout ? 'Quick workout' : 'Active workout' }}</p>
        <h1>{{ routine?.name ?? 'Loading workout' }}</h1>
        <p>
          {{ completedExerciseCount }}
          {{ completedExerciseCount === 1 ? 'exercise' : 'exercises' }} completed ·
          {{ loggedSetCount }} {{ loggedSetCount === 1 ? 'set' : 'sets' }} logged
        </p>
      </div>
      <strong class="elapsed">{{ elapsedLabel }}</strong>
    </header>

    <section v-if="restSeconds > 0" class="rest-banner" aria-live="polite">
      <ClockIcon />
      <div>
        <strong>Rest timer</strong>
        <p>{{ restLabel }} remaining</p>
      </div>
      <div class="rest-actions">
        <button type="button" @click="addRestTime">+30 sec</button>
        <button type="button" @click="skipRest">Skip</button>
      </div>
    </section>

    <main class="exercise-stack">
      <section v-if="quickWorkout && !currentExercise" class="quick-empty">
        <span><PlusIcon /></span>
        <h2>Add your first exercise</h2>
        <p>Choose an exercise, log your sets, and add more whenever you need them.</p>
        <button type="button" @click="openExercisePicker"><PlusIcon /> Choose exercise</button>
      </section>

      <section v-if="currentExercise" class="exercise-card">
        <header class="exercise-heading">
          <div>
            <p class="eyebrow">
              Exercise {{ activeExerciseIndex + 1 }} of {{ routine?.exercises.length }}
            </p>
            <h2>{{ currentExercise.name }}</h2>
            <ExerciseTags compact :tags="currentExercise.tags" />
          </div>
        </header>

        <div v-if="completedExercises[currentExercise.id]" class="completed-exercise">
          <span class="completed-icon"><CheckIcon /></span>
          <div>
            <strong>Exercise completed</strong>
            <p>
              {{ exerciseLoggedSetCount(currentExercise.id) }}
              {{ exerciseLoggedSetCount(currentExercise.id) === 1 ? 'set' : 'sets' }} logged
            </p>
          </div>
          <button type="button" @click="reopenExercise(currentExercise.id)">Reopen</button>
        </div>

        <template v-else>
          <div class="set-grid set-labels" aria-hidden="true">
            <span>Set</span><span>Previous</span><span>kg</span><span>Reps</span>
          </div>
          <div
            v-for="(set, setIndex) in workoutStore.getSets(routineID, currentExercise.id)"
            :key="setIndex"
            class="set-grid set-row"
            :class="{ complete: isCompleteSet(set) }"
          >
            <span class="set-number">
              <CheckIcon v-if="isCompleteSet(set)" />
              <template v-else>{{ setIndex + 1 }}</template>
            </span>
            <span class="previous-value">
              <template v-if="previousSet(currentExercise.id, setIndex)">
                {{ previousSet(currentExercise.id, setIndex)?.weight }} ×
                {{ previousSet(currentExercise.id, setIndex)?.reps }}
              </template>
              <span v-else>—</span>
            </span>
            <input
              v-model.number="set.weight"
              type="text"
              inputmode="decimal"
              :aria-label="`${currentExercise.name} set ${setIndex + 1} weight`"
              @input="onSetInput(currentExercise.id, set, setIndex)"
              @focus="copyPreviousValue($event, currentExercise.id, set, setIndex, 'weight')"
            />
            <input
              v-model.number="set.reps"
              type="text"
              inputmode="numeric"
              :aria-label="`${currentExercise.name} set ${setIndex + 1} repetitions`"
              @input="onSetInput(currentExercise.id, set, setIndex)"
              @focus="copyPreviousValue($event, currentExercise.id, set, setIndex, 'reps')"
            />
            <button
              type="button"
              class="remove-set"
              :aria-label="`Remove set ${setIndex + 1}`"
              @click="deleteWorkoutSet(currentExercise.id, setIndex)"
            >
              <MinusIcon />
            </button>
          </div>

          <button
            type="button"
            class="next-exercise-button"
            :disabled="!canCompleteExercise(currentExercise.id)"
            @click="advanceExercise"
          >
            <CheckIcon /> {{ nextActionLabel }}
          </button>
        </template>
      </section>

      <section v-if="exerciseQueue.length" class="exercise-queue">
        <header>
          <div>
            <p class="eyebrow">Session</p>
            <h2>Exercise queue</h2>
          </div>
          <small>Tap to switch</small>
        </header>
        <div>
          <button
            v-for="entry in exerciseQueue"
            :key="entry.exercise.id"
            type="button"
            :class="{ completed: completedExercises[entry.exercise.id] }"
            @click="selectExercise(entry.index)"
          >
            <span class="queue-number">
              <CheckIcon v-if="completedExercises[entry.exercise.id]" />
              <template v-else>{{ entry.index + 1 }}</template>
            </span>
            <span class="queue-copy">
              <strong>{{ entry.exercise.name }}</strong>
              <ExerciseTags compact :tags="entry.exercise.tags" />
              <small v-if="exerciseLoggedSetCount(entry.exercise.id)">
                {{ exerciseLoggedSetCount(entry.exercise.id) }}
                {{ exerciseLoggedSetCount(entry.exercise.id) === 1 ? 'set' : 'sets' }} logged
              </small>
              <small v-else-if="previousSet(entry.exercise.id, 0)">
                Previous {{ previousSet(entry.exercise.id, 0)?.weight }} ×
                {{ previousSet(entry.exercise.id, 0)?.reps }}
              </small>
              <small v-else>Not started</small>
            </span>
            <ChevronRightIcon />
          </button>
        </div>
      </section>

      <section v-if="!quickWorkout || (routine?.exercises.length ?? 0) > 0" class="workout-tools">
        <button type="button" class="add-exercise" @click="openExercisePicker">
          <PlusIcon />
          <span><strong>Add exercise</strong><small>Only for this workout</small></span>
        </button>

        <section class="note-card">
          <label for="workout-note">Workout note <span>Optional</span></label>
          <textarea
            id="workout-note"
            ref="textarea"
            v-model="note"
            placeholder="How did the session feel?"
          ></textarea>
        </section>
      </section>
    </main>

    <div v-if="exercisePickerOpen" class="picker-backdrop" @click.self="closeExercisePicker">
      <section
        class="exercise-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-picker-title"
      >
        <header>
          <div>
            <p class="eyebrow">Workout only</p>
            <h2 id="exercise-picker-title">Add an exercise</h2>
          </div>
          <button type="button" aria-label="Close exercise picker" @click="closeExercisePicker">
            <XMarkIcon />
          </button>
        </header>

        <label class="exercise-search">
          <MagnifyingGlassIcon />
          <input
            v-model="exerciseSearch"
            type="search"
            placeholder="Search exercises"
            aria-label="Search exercises"
          />
        </label>

        <div v-if="exercisePickerLoading && !exerciseOptionsLoaded" class="picker-empty">
          Loading exercises…
        </div>
        <div v-else-if="availableExercises.length" class="exercise-options">
          <button
            v-for="exercise in availableExercises"
            :key="exercise.id"
            type="button"
            @click="addExerciseToWorkout(exercise)"
          >
            <span class="min-w-0"
              ><strong>{{ exercise.name }}</strong
              ><ExerciseTags compact :tags="exercise.tags"
            /></span>
            <PlusIcon />
          </button>
        </div>
        <div v-else class="picker-empty">
          {{
            exerciseSearch
              ? 'No exercises match your search.'
              : 'All available exercises are already in this workout.'
          }}
        </div>

        <button
          v-if="hasMoreExercises"
          type="button"
          class="load-more"
          :disabled="exercisePickerLoading"
          @click="loadExerciseOptions"
        >
          {{ exercisePickerLoading ? 'Loading…' : 'Load more exercises' }}
        </button>
      </section>
    </div>

    <div v-if="finishDialogOpen" class="picker-backdrop" @click.self="finishDialogOpen = false">
      <section
        class="finish-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="finish-dialog-title"
      >
        <span class="dialog-handle" aria-hidden="true"></span>
        <h2 id="finish-dialog-title">Finish workout early?</h2>
        <p>
          You still have {{ unfinishedExerciseCount }}
          {{ unfinishedExerciseCount === 1 ? 'exercise' : 'exercises' }} unfinished. Every logged
          set will be saved.
        </p>
        <button type="button" class="confirm-finish" @click="confirmFinishWorkout">
          <FlagIcon /> Finish and save
        </button>
        <button type="button" class="keep-training" @click="finishDialogOpen = false">
          Keep training
        </button>
      </section>
    </div>

    <div v-if="leaveDialogOpen" class="picker-backdrop" @click.self="closeLeaveDialog">
      <section
        class="finish-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-dialog-title"
      >
        <span class="dialog-handle" aria-hidden="true"></span>
        <template v-if="discardConfirmationOpen">
          <p class="eyebrow text-red-600">Discard workout</p>
          <h2 id="leave-dialog-title">Delete this workout?</h2>
          <p>
            All sets, added exercises, and notes saved on this device will be permanently removed.
            Your active plan will not advance.
          </p>
          <button type="button" class="confirm-discard" @click="discardWorkout">
            <TrashIcon /> Discard workout
          </button>
          <button type="button" class="keep-training" @click="discardConfirmationOpen = false">
            Go back
          </button>
        </template>
        <template v-else>
          <p class="eyebrow text-emerald-700">Autosaved</p>
          <h2 id="leave-dialog-title">Leave workout?</h2>
          <p>Your progress is saved on this device. You can resume from Workout.</p>
          <button type="button" class="confirm-finish" @click="saveAndLeave">
            Save &amp; leave
          </button>
          <button type="button" class="discard-workout" @click="discardConfirmationOpen = true">
            Discard workout
          </button>
          <button type="button" class="keep-training" @click="closeLeaveDialog">Stay</button>
        </template>
      </section>
    </div>

    <footer class="finish-dock">
      <strong v-if="finishError || finishStatus" :class="{ 'text-red-600': finishError }">{{
        finishError || finishStatus
      }}</strong>
      <div class="finish-actions">
        <button
          type="button"
          class="cancel-workout"
          aria-label="Cancel workout"
          @click="cancelWorkout"
        >
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
.workout-shell {
  @apply mx-auto max-w-3xl space-y-4 pb-28;
}
.workout-header {
  @apply grid grid-cols-[1fr_auto] items-center gap-3 px-1 py-1;
}
.eyebrow {
  @apply text-xs font-semibold uppercase tracking-wider text-slate-500;
}
.workout-header h1 {
  @apply text-xl font-semibold tracking-tight text-slate-950;
}
.workout-header p:last-child {
  @apply mt-0.5 text-sm text-slate-500;
}
.elapsed {
  @apply rounded-xl bg-indigo-50 px-3 py-2 font-mono text-sm text-indigo-700;
}
.rest-banner {
  @apply sticky top-0 z-30 grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-3xl border border-stone-300 bg-stone-50/95 p-4 text-stone-900 shadow-sm backdrop-blur;
}
.rest-banner > svg {
  @apply size-6;
}
.rest-banner p {
  @apply text-sm text-stone-700;
}
.rest-actions {
  @apply flex items-center;
}
.rest-banner button {
  @apply min-h-10 rounded-xl px-3 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-200/70;
}
.exercise-stack {
  @apply space-y-4;
}
.quick-empty {
  @apply grid justify-items-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm;
}
.quick-empty > span {
  @apply grid size-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-600;
}
.quick-empty > span svg {
  @apply size-6;
}
.quick-empty h2 {
  @apply text-xl font-semibold tracking-tight text-slate-950;
}
.quick-empty p {
  @apply max-w-sm text-sm text-slate-500;
}
.quick-empty button {
  @apply mt-1 inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white;
}
.quick-empty button svg {
  @apply size-5;
}
.exercise-card,
.note-card,
.exercise-queue {
  @apply rounded-2xl border border-slate-200 bg-white shadow-sm;
}
.exercise-card {
  @apply p-4 sm:p-5;
}
.exercise-heading {
  @apply mb-4 flex items-start justify-between gap-3;
}
.exercise-heading h2 {
  @apply mt-1 text-xl font-semibold tracking-tight;
}
.exercise-heading p:last-child {
  @apply mt-1 text-sm text-slate-500;
}
.set-grid {
  @apply grid grid-cols-[2rem_minmax(3.4rem,1fr)_4.5rem_4rem] items-center gap-2;
}
.set-labels {
  @apply pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500;
}
.set-row {
  @apply relative border-t border-slate-100 py-2;
}
.set-row.complete {
  @apply text-emerald-700;
}
.set-number {
  @apply grid size-8 place-items-center text-center text-sm font-semibold;
}
.set-number svg {
  @apply size-4;
}
.previous-value {
  @apply truncate text-sm text-slate-500;
}
.set-row input {
  @apply min-w-0 rounded-xl border-slate-200 px-2 py-2 text-center font-semibold shadow-sm focus:border-indigo-500 focus:ring-indigo-500;
}
.remove-set {
  @apply absolute -right-2 -top-1 grid size-6 place-items-center rounded-full bg-slate-100 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600;
}
.set-row:hover .remove-set,
.remove-set:focus-visible {
  @apply opacity-100;
}
.remove-set svg {
  @apply size-4;
}
.next-exercise-button {
  @apply mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400;
}
.next-exercise-button svg {
  @apply size-5;
}
.completed-exercise {
  @apply grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-800;
}
.completed-icon {
  @apply grid size-9 place-items-center rounded-full bg-emerald-100;
}
.completed-icon svg {
  @apply size-5;
}
.completed-exercise strong {
  @apply text-sm font-semibold;
}
.completed-exercise p {
  @apply mt-0.5 text-xs text-emerald-700;
}
.completed-exercise button {
  @apply rounded-lg px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100;
}
.exercise-queue {
  @apply overflow-hidden px-4 pb-1 pt-4 sm:px-5;
}
.exercise-queue > header {
  @apply flex items-end justify-between gap-3 pb-3;
}
.exercise-queue h2 {
  @apply mt-1 text-lg font-semibold tracking-tight text-slate-950;
}
.exercise-queue > header > small {
  @apply text-xs text-slate-500;
}
.exercise-queue > div {
  @apply divide-y divide-slate-100 border-t border-slate-100;
}
.exercise-queue button {
  @apply grid min-h-16 w-full grid-cols-[2.25rem_1fr_auto] items-center gap-3 py-2.5 text-left transition hover:text-indigo-700;
}
.queue-number {
  @apply grid size-8 place-items-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500;
}
.queue-number svg {
  @apply size-4;
}
.queue-copy {
  @apply min-w-0;
}
.queue-copy strong,
.queue-copy small {
  @apply block truncate;
}
.queue-copy strong {
  @apply text-sm font-semibold text-slate-900;
}
.queue-copy small {
  @apply mt-0.5 text-xs text-slate-500;
}
.exercise-queue button > svg {
  @apply size-5 text-slate-400;
}
.exercise-queue button.completed .queue-number {
  @apply bg-emerald-50 text-emerald-700;
}
.exercise-queue button.completed .queue-copy strong {
  @apply text-emerald-800;
}
.workout-tools {
  @apply space-y-3;
}
.add-exercise {
  @apply flex w-full items-center justify-center gap-3 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 p-4 text-left text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50;
}
.add-exercise > svg {
  @apply size-5;
}
.add-exercise strong,
.add-exercise small {
  @apply block;
}
.add-exercise strong {
  @apply text-sm font-semibold;
}
.add-exercise small {
  @apply mt-0.5 text-xs text-indigo-500;
}
.note-card {
  @apply p-4 shadow-none;
}
.note-card label {
  @apply flex items-center justify-between text-sm font-semibold text-slate-900;
}
.note-card label span {
  @apply font-normal text-slate-500;
}
.note-card textarea {
  @apply mt-3 min-h-24 w-full resize-none rounded-xl border-slate-200 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:ring-indigo-500;
}
.finish-dock {
  padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
  @apply fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-3xl flex-col items-stretch gap-2 border-t border-slate-200 bg-white px-4 pt-3 text-center shadow-[0_-8px_24px_rgba(15,23,42,0.08)] sm:bottom-4 sm:rounded-2xl sm:border sm:pb-3;
}
.finish-actions {
  @apply flex items-stretch gap-2;
}
.cancel-workout {
  @apply grid size-12 shrink-0 place-items-center rounded-xl bg-slate-200 text-slate-700 transition hover:bg-slate-300;
}
.finish-workout {
  @apply inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300;
}
.finish-dock svg {
  @apply size-5;
}
.picker-backdrop {
  @apply fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-6;
}
.exercise-picker {
  @apply w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl;
}
.exercise-picker header {
  @apply mb-4 flex items-center justify-between gap-4;
}
.exercise-picker header h2 {
  @apply mt-1 text-xl font-semibold text-slate-950;
}
.exercise-picker header button {
  @apply grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-500;
}
.exercise-picker header button svg {
  @apply size-5;
}
.exercise-search {
  @apply mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3;
}
.exercise-search svg {
  @apply size-5 text-slate-400;
}
.exercise-search input {
  @apply h-11 w-full border-0 bg-transparent p-0 text-sm focus:ring-0;
}
.exercise-options {
  @apply max-h-80 space-y-2 overflow-y-auto;
}
.exercise-options button {
  @apply flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50;
}
.exercise-options strong,
.exercise-options small {
  @apply block truncate;
}
.exercise-options strong {
  @apply text-sm font-semibold text-slate-900;
}
.exercise-options small {
  @apply mt-0.5 text-xs text-slate-500;
}
.exercise-options button > svg {
  @apply size-5 shrink-0 text-indigo-600;
}
.picker-empty {
  @apply rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500;
}
.load-more {
  @apply mt-4 min-h-11 w-full rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:text-slate-400;
}
.finish-dialog {
  @apply w-full max-w-lg rounded-t-3xl bg-white p-5 text-left shadow-2xl sm:rounded-3xl;
}
.dialog-handle {
  @apply mx-auto mb-4 block h-1 w-12 rounded-full bg-slate-200 sm:hidden;
}
.finish-dialog h2 {
  @apply text-xl font-semibold tracking-tight text-slate-950;
}
.finish-dialog p {
  @apply mt-2 text-sm leading-6 text-slate-500;
}
.finish-dialog button {
  @apply mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold;
}
.finish-dialog button svg {
  @apply size-5;
}
.confirm-finish {
  @apply bg-indigo-600 text-white hover:bg-indigo-700;
}
.keep-training {
  @apply border border-slate-200 text-slate-700 hover:bg-slate-50;
}
.discard-workout {
  @apply border border-red-200 text-red-600 hover:bg-red-50;
}
.confirm-discard {
  @apply bg-red-600 text-white hover:bg-red-700;
}
@media (max-width: 520px) {
  .set-grid {
    @apply grid-cols-[1.5rem_minmax(2.8rem,1fr)_4.25rem_3.75rem] gap-1.5;
  }
  .set-labels {
    @apply text-[0.65rem];
  }
  .set-row input {
    @apply px-1;
  }
}
</style>
