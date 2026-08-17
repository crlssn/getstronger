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
import { useI18n } from 'vue-i18n'

import { useAlertStore } from '@/stores/alerts'
import { useWorkoutStore } from '@/stores/workout'
import { useDashboardStore } from '@/stores/dashboard'
import { usePageTitleStore } from '@/stores/pageTitle'
import { useStreakStore } from '@/stores/streak'
import { useActivityStore } from '@/stores/activity'
import { useAuthStore } from '@/stores/auth'
import { usePreferencesStore } from '@/stores/preferences'
import {
  createWorkout,
  getExercise,
  getCurrentUser,
  getPreviousWorkoutSets,
  getRoutine,
  listExercises,
} from '@/http/requests'
import { isNumber } from '@/utils/numbers'
import ExerciseTags from '@/ui/exercises/ExerciseTags.vue'
import DurationInput from '@/ui/workouts/DurationInput.vue'
import {
  formatExerciseSet,
  hasAnyExerciseSetValue,
  isExerciseSetComplete,
  measurementsForExercise,
  type MeasurementField,
} from '@/utils/exerciseMeasurements'
import { convertWeight, normalizeWeightUnit, weightUnitLabel } from '@/utils/weightUnits'
import { convertDistance, normalizeDistanceUnit, distanceUnitLabel } from '@/utils/distanceUnits'

const { input: note, textarea } = useTextareaAutosize()
const { t } = useI18n()
const route = useRoute()
const quickWorkout = route.name === 'quick-workout'
const routineID = quickWorkout ? 'quick-workout' : (route.params.routine_id as string)
const requestedPlanID = typeof route.query.plan_id === 'string' ? route.query.plan_id : ''
const routine = ref<Routine>()
const prevExerciseSets = ref<ExerciseSets[]>([])
const startedAt = ref<DateTime<boolean>>(DateTime.now())
const elapsedSeconds = ref(0)
const restSeconds = ref(0)
const restTotalSeconds = ref(0)
const completedSets = ref<Record<string, boolean>>({})
const completedExercises = ref<Record<string, boolean>>({})
const activeExerciseIndex = ref(0)
const submitting = ref(false)
const savedWorkoutId = ref('')
const finishError = ref('')
const blockedMessage = ref('')
const finishDialogOpen = ref(false)
const exercisePickerOpen = ref(false)
const leaveDialogOpen = ref(false)
const discardConfirmationOpen = ref(false)
const exercisePickerLoading = ref(false)
const exerciseOptionsLoaded = ref(false)
const exerciseOptions = ref<Exercise[]>([])
const exerciseSearch = ref('')
const exercisePageToken = ref<Uint8Array>(new Uint8Array(0))
const exerciseCard = ref<HTMLElement | null>(null)

const authStore = useAuthStore()
const preferencesStore = usePreferencesStore()
const defaultWeightUnit = ref(preferencesStore.weightUnit)
const defaultDistanceUnit = ref(preferencesStore.distanceUnit)
const workoutStore = useWorkoutStore()
const dashboardStore = useDashboardStore()
const alertStore = useAlertStore()
const pageTitleStore = usePageTitleStore()
const streakStore = useStreakStore()
const activityStore = useActivityStore()

watch(note, (value) => workoutStore.setNote(routineID, value))

let elapsedInterval: ReturnType<typeof setInterval>
let restInterval: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  const userResponse = await getCurrentUser(authStore.userId)
  if (userResponse?.user) {
    defaultWeightUnit.value = normalizeWeightUnit(userResponse.user.weightUnit)
    preferencesStore.setWeightUnit(userResponse.user.weightUnit)
    defaultDistanceUnit.value = normalizeDistanceUnit(userResponse.user.distanceUnit)
    preferencesStore.setDistanceUnit(userResponse.user.distanceUnit)
  }
  workoutStore.syncWeightUnits(routineID, defaultWeightUnit.value)
  workoutStore.syncDistanceUnits(routineID, defaultDistanceUnit.value)
  await initializeRoutine()
  elapsedSeconds.value = Math.max(
    0,
    Math.floor(DateTime.now().diff(startedAt.value, 'seconds').seconds),
  )
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
const exerciseByID = (exerciseID: string) =>
  routine.value?.exercises.find((exercise) => exercise.id === exerciseID)
const isCompleteSet = (set: Set, exercise = currentExercise.value) =>
  isExerciseSetComplete(set, exercise)
const loggedSetCount = computed(() => {
  if (!routine.value) return 0
  return routine.value.exercises.reduce(
    (total, exercise) =>
      total +
      workoutStore.getSets(routineID, exercise.id).filter((set) => isCompleteSet(set, exercise))
        .length,
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
        .filter((set) => hasAnyExerciseSetValue(set, exercise) && !isCompleteSet(set, exercise))
        .length,
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
  if (!routine.value) return t('workout.loadingRoutine')
  if (!routine.value.exercises.length) {
    return quickWorkout ? '' : t('workout.noExercises')
  }
  if (incompleteSetCount.value > 0) {
    return t('workout.completePartialSets', incompleteSetCount.value)
  }
  if (!loggedSetCount.value) return t('workout.logOneSetToFinish')
  return ''
})

// One clock, one costume: the same m:ss the tab bar's timer badge shows.
const elapsedLabel = computed(() => {
  const seconds = elapsedSeconds.value
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = (seconds % 60).toString().padStart(2, '0')
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${remainder}`
  return `${minutes}:${remainder}`
})
const sessionProgress = computed(() => {
  const total = routine.value?.exercises.length ?? 0
  return total > 0 ? `${(completedExerciseCount.value / total) * 100}%` : '0%'
})
// The set you are about to log. It carries the emphasis so the row you want is
// findable at arm's length, which is the distance this screen is read from.
const activeSetIndex = computed(() => {
  const exercise = currentExercise.value
  if (!exercise) return -1
  return workoutStore
    .getSets(routineID, exercise.id)
    .findIndex((set) => !isCompleteSet(set, exercise))
})
const restLabel = computed(() => formatTimer(restSeconds.value))
const restFraction = computed(() =>
  restTotalSeconds.value > 0
    ? Math.max(0, Math.min(1, restSeconds.value / restTotalSeconds.value))
    : 0,
)
const restProgress = computed(() => `${restFraction.value * 100}%`)
// Each remaining minute owns a hue, so a glance at the colour tells you roughly
// how long is left: violet, blue, teal, then green. The final minute is handled
// separately as a bright band (see .bright) rather than another dark hue.
const restMinuteHues = [45, 100, 165, 205, 270]
const restHue = computed(
  () => restMinuteHues[Math.min(Math.floor(restSeconds.value / 60), restMinuteHues.length - 1)],
)
// The last minute goes sunny instead of darker: this is the run-up to lifting,
// so it should read as energising rather than as a warning.
const restFinalMinute = computed(() => restSeconds.value > 0 && restSeconds.value < 60)
const restFinalCountdown = computed(() => restSeconds.value > 0 && restSeconds.value <= 10)
const nextActionLabel = computed(() =>
  nextIncompleteExerciseIndex.value >= 0 &&
  nextIncompleteExerciseIndex.value !== activeExerciseIndex.value
    ? 'Next exercise'
    : 'Complete exercise',
)

// The dock holds a single forward action: advance while exercises remain,
// finish once they are all done.
const allExercisesComplete = computed(() => unfinishedExerciseCount.value === 0)
const primaryActionLabel = computed(() => {
  if (!allExercisesComplete.value) return nextActionLabel.value
  return submitting.value ? 'Saving…' : 'Finish workout'
})
const canRunPrimaryAction = computed(() =>
  allExercisesComplete.value
    ? canFinish.value
    : Boolean(currentExercise.value && canCompleteExercise(currentExercise.value.id)),
)
// Blocked, not disabled. A grey fill on the screen's dominant control reads as
// broken rather than as waiting for something, so the button stays live and
// says what is missing when it is pressed.
const blockedReason = computed(() => {
  // An empty quick workout counts as "all exercises complete", so this is
  // checked first or the screen with nothing on it says nothing at all.
  const exercise = currentExercise.value
  if (!exercise) return t('workout.blockedNoExercise')
  if (allExercisesComplete.value) return finishStatus.value
  if (exerciseHasIncompleteSets(exercise.id)) return t('workout.blockedPartialSet')
  if (!exerciseLoggedSetCount(exercise.id)) return t('workout.blockedNoSet')
  return ''
})
// Only the finish-related hints are worth surfacing unprompted; while logging,
// the empty set field is the instruction.
const primaryStatus = computed(() => (allExercisesComplete.value ? finishStatus.value : ''))
// A message about what is missing outlives its usefulness the moment it stops
// being missing. A message about a save that failed does not.
watch(
  () => canRunPrimaryAction.value,
  (runnable) => {
    if (runnable) blockedMessage.value = ''
  },
)

const onPrimaryAction = async () => {
  if (!canRunPrimaryAction.value) {
    blockedMessage.value = blockedReason.value
    return
  }
  blockedMessage.value = ''
  if (!allExercisesComplete.value) {
    advanceExercise()
    return
  }
  await requestFinishWorkout()
}

// Puts the cursor on the set you are about to log, so the keyboard is aimed at
// the right field after advancing or after a rest ends. Never steals focus from
// a field the user is already typing in.
const focusNextSetInput = async () => {
  await nextTick()
  if (document.activeElement instanceof HTMLInputElement) return

  const inputs = exerciseCard.value?.querySelectorAll('input') ?? []
  for (const input of inputs) {
    if (!input.value) {
      input.focus()
      return
    }
  }
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
    const savedExercises = workoutStore.getAddedExercises(routineID)
    const currentExercises = await Promise.all(
      savedExercises.map(async (savedExercise) => {
        const response = await getExercise(savedExercise.id)
        return response?.exercise ?? savedExercise
      }),
    )
    currentExercises.forEach((exercise) => {
      routine.value?.exercises.push(exercise)
      workoutStore.addWorkoutExercise(routineID, exercise)
    })
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
    restoreRestTimer()
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
  restoreRestTimer()
}

const addEmptySetsFromPreviousSession = () => {
  routine.value?.exercises.forEach((exercise) =>
    workoutStore.addEmptySetIfNone(
      routineID,
      exercise.id,
      exercise.metrics,
      defaultWeightUnit.value,
      defaultDistanceUnit.value,
    ),
  )

  prevExerciseSets.value.forEach((exerciseSets) => {
    if (!exerciseSets.exercise) return
    const currentLength = workoutStore.getSets(routineID, exerciseSets.exercise.id).length
    for (let index = currentLength; index < exerciseSets.sets.length; index += 1) {
      workoutStore.addEmptySet(
        routineID,
        exerciseSets.exercise.id,
        defaultWeightUnit.value,
        defaultDistanceUnit.value,
      )
    }
  })
}

const previousSet = (exerciseID: string, index: number) =>
  prevExerciseSets.value.find((entry) => entry.exercise?.id === exerciseID)?.sets[index]

const setKey = (exerciseID: string, index: number) => `${exerciseID}:${index}`

const seedCompletedSets = () => {
  routine.value?.exercises.forEach((exercise) => {
    workoutStore.getSets(routineID, exercise.id).forEach((set, index) => {
      if (isCompleteSet(set, exercise)) completedSets.value[setKey(exercise.id, index)] = true
    })
  })
}

const syncSetCompletion = (exerciseID: string, set: Set, index: number) => {
  const exercise = exerciseByID(exerciseID)
  const key = setKey(exerciseID, index)
  if (isCompleteSet(set, exercise)) {
    if (!completedSets.value[key]) {
      completedSets.value[key] = true
      useExerciseRestTimer(exercise)
    }
    return
  }

  delete completedSets.value[key]
}

const onSetInput = (exerciseID: string, set: Set, index: number) => {
  finishError.value = ''
  workoutStore.addEmptySetIfNone(
    routineID,
    exerciseID,
    exerciseByID(exerciseID)?.metrics,
    defaultWeightUnit.value,
    defaultDistanceUnit.value,
  )
  syncSetCompletion(exerciseID, set, index)
}

const copyPreviousValue = async (
  event: Event,
  exerciseId: string,
  set: Set,
  index: number,
  field: MeasurementField,
) => {
  if (isNumber(set[field])) return
  const previous =
    previousSet(exerciseId, index) ?? workoutStore.getSets(routineID, exerciseId)[index - 1]
  if (!previous) return

  const previousWeight = previous.weight
  const previousDistance = previous.distance
  if (field === 'weight' && typeof previousWeight === 'number' && !Number.isNaN(previousWeight)) {
    // The previous set may have been logged under an older preference, so the
    // value is converted. Write the unit alongside it: a weight and the unit it
    // is expressed in must never be set independently.
    set.weight = convertWeight(
      previousWeight,
      normalizeWeightUnit(previous.weightUnit),
      defaultWeightUnit.value,
    )
    set.weightUnit = defaultWeightUnit.value
  } else if (
    field === 'distance' &&
    typeof previousDistance === 'number' &&
    !Number.isNaN(previousDistance)
  ) {
    // Same contract as weight: the copied distance is converted into the unit
    // this set will be logged in.
    set.distance = convertDistance(
      previousDistance,
      normalizeDistanceUnit(previous.distanceUnit),
      defaultDistanceUnit.value,
    )
    set.distanceUnit = defaultDistanceUnit.value
  } else {
    set[field] = previous[field]
  }
  workoutStore.addEmptySetIfNone(
    routineID,
    exerciseId,
    exerciseByID(exerciseId)?.metrics,
    defaultWeightUnit.value,
    defaultDistanceUnit.value,
  )
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
    if (isCompleteSet(set, exerciseByID(exerciseID)))
      completedSets.value[setKey(exerciseID, setIndex)] = true
  })
}

const clearRestTimer = () => {
  if (restInterval) clearInterval(restInterval)
  restInterval = undefined
  restSeconds.value = 0
  restTotalSeconds.value = 0
  workoutStore.setRestTimer(routineID)
}

const runRestTimer = (endsAtMs: number, totalSeconds: number) => {
  if (restInterval) clearInterval(restInterval)
  restTotalSeconds.value = totalSeconds

  const updateRemaining = () => {
    restSeconds.value = Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1000))
    if (restSeconds.value > 0) return

    if (restInterval) clearInterval(restInterval)
    restInterval = undefined
    void focusNextSetInput()
  }

  updateRemaining()
  if (restSeconds.value <= 0) return
  restInterval = setInterval(() => {
    updateRemaining()
  }, 1000)
}

const startRestTimer = (seconds = 90) => {
  const endsAtMs = Date.now() + seconds * 1000
  workoutStore.setRestTimer(routineID, new Date(endsAtMs).toISOString(), seconds)
  runRestTimer(endsAtMs, seconds)
}

const useExerciseRestTimer = (exercise?: Exercise) => {
  if (exercise?.restSeconds) {
    startRestTimer(exercise.restSeconds)
    return
  }

  clearRestTimer()
}

const restoreRestTimer = () => {
  const savedTimer = workoutStore.getRestTimer(routineID)
  if (!savedTimer.endsAt) return

  const endsAtMs = Date.parse(savedTimer.endsAt)
  if (Number.isNaN(endsAtMs)) {
    workoutStore.setRestTimer(routineID)
    return
  }
  // The dashboard-level timer owns natural expiry so its cleanup continues
  // even when the user navigates away from this view.
  if (endsAtMs <= Date.now()) return

  const remainingSeconds = Math.ceil((endsAtMs - Date.now()) / 1000)
  runRestTimer(endsAtMs, Math.max(savedTimer.totalSeconds, remainingSeconds))
}

const skipRest = () => {
  clearRestTimer()
}

const addRestTime = () => {
  startRestTimer(restSeconds.value + 30)
}

const exerciseLoggedSetCount = (exerciseID: string) =>
  workoutStore
    .getSets(routineID, exerciseID)
    .filter((set) => isCompleteSet(set, exerciseByID(exerciseID))).length

const exerciseHasIncompleteSets = (exerciseID: string) =>
  workoutStore
    .getSets(routineID, exerciseID)
    .some(
      (set) =>
        hasAnyExerciseSetValue(set, exerciseByID(exerciseID)) &&
        !isCompleteSet(set, exerciseByID(exerciseID)),
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
  void focusNextSetInput()
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
    useExerciseRestTimer(routine.value?.exercises[nextIndex])
    return
  }

  const firstIncomplete = routine.value?.exercises.findIndex(
    (entry) => !completedExercises.value[entry.id],
  )
  if (firstIncomplete !== undefined && firstIncomplete >= 0) {
    selectExercise(firstIncomplete)
    useExerciseRestTimer(routine.value?.exercises[firstIncomplete])
  }
}

const buildWorkoutSets = () => {
  const allSets = workoutStore.getAllSets(routineID)
  if (!allSets) return []

  return (routine.value?.exercises ?? [])
    .map((exercise) => {
      const sets = allSets[exercise.id]?.filter((set) => isCompleteSet(set, exercise))
      if (!sets?.length) return null

      return create(ExerciseSetsSchema, {
        exercise: { id: exercise.id },
        sets: sets.map((set) => ({
          reps: set.reps as number,
          weight: set.weight as number,
          distance: set.distance ?? 0,
          durationSeconds: set.durationSeconds ?? 0,
          weightUnit: normalizeWeightUnit(set.weightUnit ?? defaultWeightUnit.value),
          distanceUnit: normalizeDistanceUnit(set.distanceUnit ?? defaultDistanceUnit.value),
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
    finishError.value = t('workout.savedNotOpened')
    return false
  }

  workoutStore.removeWorkout(routineID)
  void dashboardStore.load()
  streakStore.reset()
  activityStore.reset()
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
    finishError.value = t('workout.logCompleteSet')
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
      finishError.value = t('workout.saveFailed')
      return
    }

    const workoutId = response.workoutId.trim()
    if (!workoutId) {
      finishError.value = t('workout.savedWithoutId')
      return
    }

    savedWorkoutId.value = workoutId
    alertStore.setSuccess('Workout saved')
    await openSavedWorkout(workoutId)
  } catch (error) {
    console.error('failed to finish workout', error)
    if (savedWorkoutId.value) {
      finishError.value = t('workout.savedNotOpened')
    } else if (
      quickWorkout &&
      error instanceof ConnectError &&
      error.code === Code.InvalidArgument &&
      error.message.includes('routine_id')
    ) {
      finishError.value = t('workout.quickWorkoutUnavailable')
    } else if (error instanceof ConnectError && error.code === Code.DeadlineExceeded) {
      finishError.value = t('workout.saveTimedOut')
    } else {
      finishError.value = t('workout.saveFailed')
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
  workoutStore.addEmptySetIfNone(
    routineID,
    exercise.id,
    exercise.metrics,
    defaultWeightUnit.value,
    defaultDistanceUnit.value,
  )
  closeExercisePicker()

  const previousResponse = await getPreviousWorkoutSets([exercise.id])
  if (previousResponse) {
    prevExerciseSets.value.push(...previousResponse.exerciseSets)
    addEmptySetsFromPreviousSession()
  }
}
</script>

<template>
  <form
    class="workout-shell"
    :class="{ resting: restSeconds > 0 }"
    novalidate
    @submit.prevent="onPrimaryAction"
  >
    <!-- The session chrome carries the two things worth glancing at between
         sets: where you are, and how long you have been here. The elapsed time
         is the larger of the two because it is the one being read. -->
    <header class="workout-header">
      <div class="workout-header-inner">
        <button
          type="button"
          class="leave-workout"
          :aria-label="t('workout.leaveTitle')"
          @click="cancelWorkout"
        >
          <XMarkIcon />
        </button>
        <div class="min-w-0">
          <h1>{{ routine?.name ?? t('workout.loading') }}</h1>
          <p class="session-progress">
            {{
              t('workout.exercisePosition', {
                current: Math.min(activeExerciseIndex + 1, routine?.exercises.length ?? 0),
                total: routine?.exercises.length ?? 0,
              })
            }}
          </p>
        </div>
        <span class="elapsed" :aria-label="t('workout.elapsed')">{{ elapsedLabel }}</span>
      </div>
      <!-- A rail rather than a fraction: between sets it is read at a glance,
           and a glance does not do arithmetic. -->
      <div
        class="session-rail"
        role="progressbar"
        :aria-valuenow="completedExerciseCount"
        :aria-valuemin="0"
        :aria-valuemax="routine?.exercises.length ?? 0"
        :aria-label="t('workout.sessionProgress')"
      >
        <span :style="{ width: sessionProgress }" />
      </div>
    </header>

    <!-- The countdown is the focal point while resting; it is aria-hidden so
         screen readers are not re-announced to every second. -->
    <section
      v-if="restSeconds > 0"
      class="rest-banner"
      :class="{ final: restFinalCountdown, bright: restFinalMinute }"
      :style="{ '--rest-hue': restHue }"
      :aria-label="t('workout.restTimer')"
    >
      <div class="rest-banner-inner">
        <div class="rest-copy">
          <p class="rest-label"><ClockIcon /> {{ t('workout.rest') }}</p>
          <strong aria-hidden="true">{{ restLabel }}</strong>
        </div>
        <div class="rest-actions">
          <button type="button" @click="addRestTime">{{ t('workout.addSeconds') }}</button>
          <button type="button" @click="skipRest">{{ t('workout.skip') }}</button>
        </div>
        <div class="rest-progress" aria-hidden="true">
          <span :style="{ width: restProgress }"></span>
        </div>
      </div>
    </section>

    <main class="exercise-stack">
      <section v-if="quickWorkout && !currentExercise" class="quick-empty">
        <span><PlusIcon /></span>
        <h2>{{ t('workout.addFirstExercise') }}</h2>
        <p>{{ t('workout.addFirstExerciseBody') }}</p>
        <button type="button" @click="openExercisePicker">
          <PlusIcon /> {{ t('workout.chooseExercise') }}
        </button>
      </section>

      <section v-if="currentExercise" ref="exerciseCard" class="exercise-card">
        <header class="exercise-heading">
          <div>
            <!-- The position lives in the header now; saying it twice on one
                 screen spent a line on nothing. -->
            <h2>{{ currentExercise.name }}</h2>
            <ExerciseTags compact :tags="currentExercise.tags" />
          </div>
        </header>

        <div v-if="completedExercises[currentExercise.id]" class="completed-exercise">
          <span class="completed-icon"><CheckIcon /></span>
          <div>
            <strong>{{ t('workout.exerciseCompleted') }}</strong>
            <p>
              {{ exerciseLoggedSetCount(currentExercise.id) }}
              {{ t('workout.loggedSets', exerciseLoggedSetCount(currentExercise.id)) }}
            </p>
          </div>
          <button type="button" @click="reopenExercise(currentExercise.id)">
            {{ t('workout.reopen') }}
          </button>
        </div>

        <template v-else>
          <div
            class="set-grid set-labels"
            :style="{ '--metric-count': measurementsForExercise(currentExercise).length }"
            aria-hidden="true"
          >
            <span>{{ t('common.set') }}</span
            ><span>{{ t('common.previous') }}</span>
            <span
              v-for="measurement in measurementsForExercise(currentExercise)"
              :key="measurement.metric"
            >
              {{ t(measurement.labelKey) }}
            </span>
          </div>
          <div
            v-for="(set, setIndex) in workoutStore.getSets(routineID, currentExercise.id)"
            :key="setIndex"
            class="set-grid set-row"
            :class="{
              complete: isCompleteSet(set, currentExercise),
              active: setIndex === activeSetIndex,
            }"
            :style="{ '--metric-count': measurementsForExercise(currentExercise).length }"
          >
            <span class="set-number">
              <CheckIcon v-if="isCompleteSet(set, currentExercise)" />
              <template v-else>{{ setIndex + 1 }}</template>
            </span>
            <span class="previous-value">
              <template v-if="previousSet(currentExercise.id, setIndex)">
                {{ formatExerciseSet(previousSet(currentExercise.id, setIndex)!, currentExercise) }}
              </template>
              <span v-else>—</span>
            </span>
            <template
              v-for="measurement in measurementsForExercise(currentExercise)"
              :key="measurement.metric"
            >
              <DurationInput
                v-if="measurement.field === 'durationSeconds'"
                v-model="set.durationSeconds"
                :aria-label="`${currentExercise.name} set ${setIndex + 1} time`"
                @input="onSetInput(currentExercise.id, set, setIndex)"
                @focus="
                  copyPreviousValue($event, currentExercise.id, set, setIndex, measurement.field)
                "
              />
              <div v-else-if="measurement.field === 'weight'" class="unit-entry">
                <input
                  v-model.number="set.weight"
                  type="text"
                  inputmode="decimal"
                  :aria-label="`${currentExercise.name} set ${setIndex + 1} weight`"
                  @input="onSetInput(currentExercise.id, set, setIndex)"
                  @focus="copyPreviousValue($event, currentExercise.id, set, setIndex, 'weight')"
                />
                <span class="unit-suffix">{{ weightUnitLabel(defaultWeightUnit) }}</span>
              </div>
              <div v-else-if="measurement.field === 'distance'" class="unit-entry">
                <input
                  v-model.number="set.distance"
                  type="text"
                  inputmode="decimal"
                  :aria-label="`${currentExercise.name} set ${setIndex + 1} distance`"
                  @input="onSetInput(currentExercise.id, set, setIndex)"
                  @focus="copyPreviousValue($event, currentExercise.id, set, setIndex, 'distance')"
                />
                <span class="unit-suffix">{{ distanceUnitLabel(defaultDistanceUnit) }}</span>
              </div>
              <input
                v-else
                v-model.number="set[measurement.field]"
                type="text"
                :inputmode="measurement.inputmode"
                :aria-label="`${currentExercise.name} set ${setIndex + 1} ${t(measurement.labelKey)}`"
                @input="onSetInput(currentExercise.id, set, setIndex)"
                @focus="
                  copyPreviousValue($event, currentExercise.id, set, setIndex, measurement.field)
                "
              />
            </template>
            <button
              type="button"
              class="remove-set"
              :aria-label="`Remove set ${setIndex + 1}`"
              @click="deleteWorkoutSet(currentExercise.id, setIndex)"
            >
              <MinusIcon />
            </button>
          </div>
        </template>
      </section>

      <section v-if="exerciseQueue.length" class="exercise-queue">
        <header>
          <div>
            <p class="eyebrow">{{ t('workout.session') }}</p>
            <h2>{{ t('workout.queue') }}</h2>
          </div>
          <small>{{ t('workout.tapSwitch') }}</small>
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
                {{ t('workout.loggedSets', exerciseLoggedSetCount(entry.exercise.id)) }}
              </small>
              <small v-else-if="previousSet(entry.exercise.id, 0)">
                {{ t('common.previous') }} {{ previousSet(entry.exercise.id, 0)?.weight }}
                {{ weightUnitLabel(previousSet(entry.exercise.id, 0)?.weightUnit) }} ×
                {{ previousSet(entry.exercise.id, 0)?.reps }}
              </small>
              <small v-else>{{ t('workout.notStarted') }}</small>
            </span>
            <ChevronRightIcon />
          </button>
        </div>
      </section>

      <section v-if="!quickWorkout || (routine?.exercises.length ?? 0) > 0" class="workout-tools">
        <button type="button" class="add-exercise" @click="openExercisePicker">
          <PlusIcon />
          <span
            ><strong>{{ t('workout.addExercise') }}</strong
            ><small>{{ t('workout.onlyThisWorkout') }}</small></span
          >
        </button>

        <section class="note-card">
          <label for="workout-note"
            >{{ t('workout.note') }} <span>{{ t('common.optional') }}</span></label
          >
          <textarea
            id="workout-note"
            ref="textarea"
            v-model="note"
            :placeholder="t('workout.notePlaceholder')"
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
            <p class="eyebrow">{{ t('workout.onlyThisWorkout') }}</p>
            <h2 id="exercise-picker-title">{{ t('workout.addExercise') }}</h2>
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
            :placeholder="t('exercise.search')"
            :aria-label="t('exercise.search')"
          />
        </label>

        <div v-if="exercisePickerLoading && !exerciseOptionsLoaded" class="picker-empty">
          {{ t('exercise.loading') }}
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
          {{ exerciseSearch ? t('workout.noExerciseMatches') : t('workout.allExercisesAdded') }}
        </div>

        <button
          v-if="hasMoreExercises"
          type="button"
          class="load-more"
          :disabled="exercisePickerLoading"
          @click="loadExerciseOptions"
        >
          {{ exercisePickerLoading ? t('common.loading') : t('exercise.loadMore') }}
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
        <h2 id="finish-dialog-title">{{ t('workout.finishEarly') }}</h2>
        <p>
          You still have {{ unfinishedExerciseCount }}
          {{ unfinishedExerciseCount === 1 ? 'exercise' : 'exercises' }} unfinished. Every logged
          set will be saved.
        </p>
        <button type="button" class="confirm-finish" @click="confirmFinishWorkout">
          <FlagIcon /> {{ t('workout.finishSave') }}
        </button>
        <button type="button" class="keep-training" @click="finishDialogOpen = false">
          {{ t('workout.keepTraining') }}
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
          <p class="eyebrow text-danger">{{ t('workout.discard') }}</p>
          <h2 id="leave-dialog-title">{{ t('workout.deleteTitle') }}</h2>
          <p>
            All sets, added exercises, and notes saved on this device will be permanently removed.
            Your active plan will not advance.
          </p>
          <button type="button" class="confirm-discard" @click="discardWorkout">
            <TrashIcon /> {{ t('workout.discard') }}
          </button>
          <button type="button" class="keep-training" @click="discardConfirmationOpen = false">
            {{ t('common.back') }}
          </button>
        </template>
        <template v-else>
          <p class="eyebrow text-success">{{ t('workout.autosaved') }}</p>
          <h2 id="leave-dialog-title">{{ t('workout.leaveTitle') }}</h2>
          <p>{{ t('workout.leaveBody') }}</p>
          <button type="button" class="confirm-finish" @click="saveAndLeave">
            {{ t('workout.saveLeave') }}
          </button>
          <button type="button" class="discard-workout" @click="discardConfirmationOpen = true">
            {{ t('workout.discard') }}
          </button>
          <button type="button" class="keep-training" @click="closeLeaveDialog">
            {{ t('workout.stay') }}
          </button>
        </template>
      </section>
    </div>

    <!-- One ranked pair at the end of the session. Advancing is the primary
         action while exercises are unfinished; finishing stays reachable for
         the entire session but is demoted to a text button, because two
         controls of equal weight leave the screen with no ranking at all. -->
    <footer class="finish-dock">
      <strong
        v-if="finishError || blockedMessage || primaryStatus"
        id="workout-dock-status"
        :class="{ failed: finishError, blocked: !finishError && blockedMessage }"
        >{{ finishError || blockedMessage || primaryStatus }}</strong
      >
      <!-- Described by the status rather than aria-disabled: the whole point
           is that this control is pressable, and aria-disabled would announce
           the same "broken" that the grey fill used to. -->
      <button
        type="submit"
        class="primary-action"
        :aria-describedby="
          finishError || blockedMessage || primaryStatus ? 'workout-dock-status' : undefined
        "
        :disabled="submitting"
      >
        <component :is="allExercisesComplete ? FlagIcon : CheckIcon" />
        {{ primaryActionLabel }}
      </button>
      <!-- Keep the escape hatch in a stable position even when a partial set
         temporarily prevents saving the workout. -->
      <button
        v-if="!allExercisesComplete"
        type="button"
        class="finish-early"
        :disabled="!canFinish"
        :title="!canFinish ? finishStatus : undefined"
        :aria-label="
          !canFinish && finishStatus
            ? `${t('workout.finish')}: ${finishStatus}`
            : t('workout.finish')
        "
        @click="requestFinishWorkout"
      >
        {{ t('workout.finish') }}
      </button>
    </footer>
  </form>
</template>

<style scoped>
@reference '../../assets/base.css';

.workout-shell {
  @apply mx-auto max-w-3xl space-y-4 pb-8;
}
/* The timer and active-workout header are one piece of session chrome. The
   shell's usual section gap belongs below the timer, not between these bars. */
.workout-shell.resting > .workout-header {
  margin-bottom: 0;
}
/* The chrome spans the viewport while its contents stay aligned with the app. */
/* Opaque, or scrolled content bleeds through and reads as passing over the
   header. */
.workout-header {
  width: 100vw;
  margin-left: calc(50% - 50vw);
  @apply sticky z-20 -mt-5 border-b border-border bg-white text-text lg:-mt-7;
  /* Below the status-bar scrim in the native WebView; zero in browsers. */
  top: env(safe-area-inset-top);
}
.workout-header-inner {
  @apply mx-auto grid w-full max-w-3xl grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 sm:px-5 lg:px-8;
}
/* Leaving lives in the chrome, away from the primary action it would undo. */
.leave-workout {
  @apply -ml-1 grid size-11 shrink-0 place-items-center rounded-control text-text-subtle transition hover:bg-ink-tint hover:text-text;
}
.leave-workout svg {
  @apply size-5;
}
.eyebrow {
  @apply text-eyebrow font-bold uppercase text-text-subtle;
}
.workout-header h1 {
  @apply truncate text-body-lg font-semibold tracking-tight text-text;
}
.session-progress {
  @apply truncate text-meta text-text-subtle;
}
/* The one thing glanced at between sets, so it outranks everything else in
   the chrome. Still yields to the rest countdown, which is a live deadline. */
/* The same mono pill the tab bar uses for this timer — one clock, one
   costume, sized up for the screen it headlines. */
.elapsed {
  @apply shrink-0 whitespace-nowrap rounded-pill bg-surface-inverse px-3 py-1.5 font-mono text-base font-bold leading-none tabular-nums text-white;
}
/* How far through the session, without asking anyone to do arithmetic. */
.session-rail {
  @apply h-1 w-full bg-border;
}
.session-rail > span {
  @apply block h-full bg-success transition-[width] duration-300;
}
/* The primary timer while resting: it carries the accent so it outranks the
   header bar, which stays light. The hue is driven by --rest-hue and shifts
   ~1.5deg per second, so it morphs smoothly without needing a transition.
   Lightness is held dark enough for white text to stay legible at every hue. */
/* Registered so the hue can be transitioned: without this the gradient would
   snap at each minute boundary instead of morphing. */
@property --rest-hue {
  syntax: '<number>';
  inherits: false;
  initial-value: 160;
}
/* A square, edge-to-edge band that rides over the header on scroll, so the
   countdown owns the top of the screen while resting. */
.rest-banner {
  width: 100vw;
  margin-left: calc(50% - 50vw);
  @apply !mt-0 sticky z-30 text-white shadow-overlay;
  /* Level with the header it covers: below the status-bar scrim in the native
     WebView, zero in browsers. */
  top: env(safe-area-inset-top);
  /* Energy comes from saturation, not lightness: near-full saturation reads
     vivid while staying dark enough for white text. The gradient runs dark at
     the top-left, where the label and countdown sit, out to a bright corner. */
  background-image: linear-gradient(
    140deg,
    hsl(var(--rest-hue, 165) 95% 21%) 0%,
    hsl(var(--rest-hue, 165) 92% 31%) 58%,
    hsl(calc(var(--rest-hue, 165) - 28) 96% 40%) 100%
  );
  transition: --rest-hue 900ms ease;
}
.rest-banner-inner {
  @apply mx-auto grid w-full max-w-3xl grid-cols-[1fr_auto] items-center gap-3 px-3 pb-4 pt-3 sm:px-5 lg:px-8;
}
.rest-copy {
  @apply min-w-0;
}
/* White, not grey: a neutral grey washes out against a saturated background. */
.rest-label {
  @apply flex items-center gap-1.5 text-eyebrow font-bold uppercase text-white/85;
}
.rest-label svg {
  @apply size-3.5;
}
.rest-copy strong {
  @apply mt-1 block font-mono text-4xl font-bold leading-none tabular-nums text-white;
}
.rest-actions {
  @apply flex shrink-0 items-center gap-1;
}
/* A dark tint keeps the white label high-contrast wherever the chips land on
   the gradient; a white tint washes out against the bright corner. */
.rest-banner button {
  @apply min-h-(--size-control-sm) rounded-control bg-black/25 px-3 text-sm font-semibold text-white transition hover:bg-black/40;
}
.rest-progress {
  @apply col-span-2 h-1.5 overflow-hidden rounded-pill bg-white/15;
}
.rest-progress span {
  @apply block h-full rounded-pill bg-white transition-[width] duration-1000 ease-linear;
}
/* The last minute goes sunny with dark text: warm hues only read as happy when
   they are bright, and bright needs dark type to stay legible. */
.rest-banner.bright {
  background-image: linear-gradient(
    140deg,
    hsl(42 100% 50%) 0%,
    hsl(50 100% 56%) 55%,
    hsl(70 92% 54%) 100%
  );
  @apply text-text;
}
.rest-banner.bright .rest-label {
  @apply text-text/70;
}
.rest-banner.bright .rest-copy strong {
  @apply text-text;
}
.rest-banner.bright button {
  @apply bg-black/15 text-text hover:bg-black/25;
}
.rest-banner.bright .rest-progress {
  @apply bg-black/15;
}
.rest-banner.bright .rest-progress span {
  @apply bg-ink-strong;
}
/* One beat per second through the last ten: the band itself brightens rather
   than the digits resizing, so the numbers stay steady and readable. */
.rest-banner.final {
  animation: rest-pulse 1s ease-in-out infinite;
}
/* An already-bright band would blow out on the dark band's pulse range. */
.rest-banner.final.bright {
  animation: rest-pulse-bright 1s ease-in-out infinite;
}
@keyframes rest-pulse-bright {
  0%,
  100% {
    filter: brightness(1) saturate(1);
  }
  45% {
    filter: brightness(1.14) saturate(1.3);
  }
}
@keyframes rest-pulse {
  0%,
  100% {
    filter: brightness(1) saturate(1);
  }
  45% {
    filter: brightness(1.55) saturate(1.25);
  }
}
@media (prefers-reduced-motion: reduce) {
  .rest-banner {
    transition: none;
  }
  .rest-banner.final,
  .rest-banner.final.bright {
    animation: none;
  }
}
.exercise-stack {
  @apply space-y-4;
}
.quick-empty {
  @apply card grid justify-items-center gap-3 p-8 text-center;
}
.quick-empty > span {
  @apply grid size-14 place-items-center rounded-card bg-ink-surface text-ink;
}
.quick-empty > span svg {
  @apply size-6;
}
.quick-empty h2 {
  @apply text-title font-semibold text-text;
}
.quick-empty p {
  @apply max-w-sm text-sm text-text-subtle;
}
.quick-empty button {
  @apply mt-2 inline-flex min-h-(--size-control) w-full items-center justify-center gap-2 justify-self-stretch rounded-control bg-ink px-4 text-base font-semibold text-white transition hover:bg-ink-strong;
}
.quick-empty button svg {
  @apply size-5;
}
.exercise-card,
.note-card,
.exercise-queue {
  @apply card;
}
.exercise-card {
  @apply p-4 sm:p-5;
}
.exercise-heading {
  @apply mb-4 flex items-start justify-between gap-3;
}
.exercise-heading h2 {
  @apply mt-1 text-title font-semibold;
}
.exercise-heading p:last-child {
  @apply mt-1 text-sm text-text-subtle;
}
.set-grid {
  /* Scrolls for many-metric exercises, but the remove button overhangs by 8px
     and would otherwise paint a scrollbar under every row. */
  scrollbar-width: none;
  @apply grid items-center gap-2 overflow-x-auto;
  grid-template-columns: 2.25rem minmax(5.5rem, 1fr) repeat(
      var(--metric-count),
      minmax(4.25rem, 0.75fr)
    );
}
.set-grid::-webkit-scrollbar {
  display: none;
}
.set-labels {
  @apply pb-2 text-eyebrow font-semibold uppercase text-text-subtle;
}
.set-labels > span:first-child {
  @apply text-center;
}
.set-row {
  @apply relative border-t border-border py-2;
}
.set-row.complete {
  @apply text-success;
}
.set-number {
  @apply grid size-8 place-items-center justify-self-center rounded-full text-center text-sm font-semibold transition;
}
/* The set number carries completion, which frees the row of a second check
   column and makes the row you are on findable without reading it. */
.set-row.complete .set-number {
  @apply bg-success-surface text-success;
}
.set-row.active .set-number {
  @apply bg-surface-inverse text-white;
}
.set-number svg {
  @apply size-4;
}
.previous-value {
  @apply truncate text-sm text-text-subtle;
}
.set-row input {
  @apply min-h-(--size-control) min-w-0 rounded-control border-border px-2 text-center font-semibold shadow-card focus:border-ink focus:ring-ink;
}
.set-row.active input,
.set-row.active .unit-entry {
  @apply border-ink;
}
.set-row.complete input,
.set-row.complete .unit-entry {
  @apply bg-surface-sunken;
}
/* Focus reveal (and focusNextSetInput) must land below the session chrome —
   the header, and the rest band that covers it — not behind it. */
.set-row input,
.unit-entry,
.note-card textarea {
  scroll-margin-top: 9rem;
}
.unit-entry {
  @apply grid min-h-(--size-control) min-w-0 grid-cols-[minmax(2.75rem,1fr)_auto] items-center overflow-hidden rounded-control border border-border bg-surface pr-2.5 shadow-card focus-within:border-ink focus-within:ring-1 focus-within:ring-ink;
}
.unit-entry > input {
  @apply w-full rounded-none border-0 shadow-none focus:border-0 focus:ring-0;
}
/* A unit is a label on the field, not a second control inside it. The old
   bordered, filled cell read as a button worth pressing. */
.unit-suffix {
  @apply pointer-events-none select-none text-meta font-medium lowercase text-text-subtle;
}
.remove-set {
  @apply absolute -right-2 -top-1 grid size-6 place-items-center rounded-full bg-ink-tint text-text-subtle opacity-0 transition hover:bg-danger-surface hover:text-danger-strong;
}
.set-row:hover .remove-set,
.remove-set:focus-visible {
  @apply opacity-100;
}
.remove-set svg {
  @apply size-4;
}
.completed-exercise {
  @apply grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-control bg-success-surface p-4 text-success;
}
.completed-icon {
  @apply grid size-9 place-items-center rounded-full bg-success text-white;
}
.completed-icon svg {
  @apply size-5;
}
.completed-exercise strong {
  @apply text-sm font-semibold;
}
.completed-exercise p {
  @apply mt-0.5 text-xs text-success;
}
.completed-exercise button {
  @apply rounded-lg px-3 py-2 text-xs font-semibold text-success hover:bg-success/10;
}
.exercise-queue {
  @apply overflow-hidden px-4 pb-1 pt-4 sm:px-5;
}
.exercise-queue > header {
  @apply flex items-end justify-between gap-3 pb-3;
}
.exercise-queue h2 {
  @apply mt-1 text-title font-semibold text-text;
}
.exercise-queue > header > small {
  @apply text-xs text-text-subtle;
}
.exercise-queue > div {
  @apply divide-y divide-border border-t border-border;
}
.exercise-queue button {
  @apply grid min-h-16 w-full grid-cols-[2.25rem_1fr_auto] items-center gap-3 py-2.5 text-left transition hover:text-ink-strong;
}
.queue-number {
  @apply grid size-8 place-items-center rounded-lg bg-info-surface text-xs font-semibold text-text-muted;
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
  @apply text-sm font-semibold text-text;
}
.queue-copy small {
  @apply mt-0.5 text-xs text-text-subtle;
}
.exercise-queue button > svg {
  @apply size-5 text-text-subtle;
}
.exercise-queue button.completed .queue-number {
  @apply bg-success-surface text-success;
}
.exercise-queue button.completed .queue-copy strong {
  @apply text-success;
}
.workout-tools {
  @apply space-y-3;
}
/* A real, solid card: the dashed ghost read as a placeholder. */
.add-exercise {
  @apply card grid w-full grid-cols-[auto_1fr] items-center gap-3 p-4 text-left transition hover:border-ink-border hover:bg-ink-surface/40;
}
.add-exercise > svg {
  @apply size-11 shrink-0 rounded-control bg-ink p-2.5 text-white;
}
.add-exercise strong,
.add-exercise small {
  @apply block;
}
.add-exercise strong {
  @apply text-base font-semibold text-text;
}
.add-exercise small {
  @apply mt-0.5 text-xs text-text-subtle;
}
.note-card {
  @apply p-4 shadow-none;
}
.note-card label {
  @apply flex items-center justify-between text-sm font-semibold text-text;
}
.note-card label span {
  @apply font-normal text-text-subtle;
}
/* The card is already the container; a bordered field inside it double-boxes. */
.note-card textarea {
  @apply mt-2 min-h-20 w-full resize-none border-0 bg-transparent p-0 text-sm placeholder:text-text-subtle focus:ring-0;
}
/* In flow at the end of the session: no container of its own, so the buttons
   sit on the page background like the rest of the screen. */
.finish-dock {
  @apply flex w-full flex-col items-stretch gap-2 text-center;
}
/* What is missing, said where the button that is waiting for it lives. */
.finish-dock > strong {
  @apply text-meta font-semibold text-text-muted;
}
.finish-dock > strong.blocked {
  @apply text-warning;
}
.finish-dock > strong.failed {
  @apply text-danger;
}
/* Blocked, not disabled: it stays filled and live, and says what is missing
   when pressed. A grey fill on the screen's dominant control reads as broken
   rather than as waiting for something, and looking different before the tap
   would put the greying back by another route. */
.primary-action {
  @apply inline-flex min-h-(--size-control-lg) w-full items-center justify-center gap-2 rounded-control bg-ink px-5 text-base font-semibold text-white transition hover:brightness-125 disabled:opacity-70;
}
/* Demoted to a text button. It is the escape hatch, not the other half of a
   pair, and giving it equal weight left the dock with no ranking at all. */
.finish-early {
  @apply inline-flex min-h-(--size-control) w-full items-center justify-center rounded-control px-4 text-sm font-semibold text-text-muted transition hover:bg-surface-sunken hover:text-text disabled:cursor-not-allowed disabled:opacity-50;
}
.finish-dock svg {
  @apply size-5;
}
.picker-backdrop {
  @apply fixed inset-0 z-50 flex items-end justify-center bg-ink-strong/40 sm:items-center sm:p-6;
}
.exercise-picker {
  @apply flex max-h-[75vh] w-full max-w-lg flex-col rounded-t-sheet bg-white p-5 shadow-overlay sm:rounded-sheet;
}
.exercise-picker header {
  @apply mb-4 flex items-center justify-between gap-4;
}
.exercise-picker header h2 {
  @apply mt-1 text-title font-semibold text-text;
}
.exercise-picker header button {
  @apply grid size-11 place-items-center rounded-control border border-border text-text-subtle;
}
.exercise-picker header button svg {
  @apply size-5;
}
.exercise-search {
  @apply mb-4 flex items-center gap-2 rounded-control border border-border bg-ink-surface px-3;
}
.exercise-search svg {
  @apply size-5 text-text-subtle;
}
.exercise-search input {
  @apply h-11 w-full border-0 bg-transparent p-0 text-sm focus:ring-0;
}
.exercise-options {
  @apply min-h-0 flex-1 space-y-2 overflow-y-auto;
}
.exercise-options button {
  @apply flex min-h-(--size-control-lg) w-full items-center justify-between gap-3 rounded-control border border-border px-4 py-3 text-left transition hover:border-ink-border hover:bg-ink-surface;
}
.exercise-options strong,
.exercise-options small {
  @apply block truncate;
}
.exercise-options strong {
  @apply text-sm font-semibold text-text;
}
.exercise-options small {
  @apply mt-0.5 text-xs text-text-subtle;
}
.exercise-options button > svg {
  @apply size-5 shrink-0 text-ink;
}
.picker-empty {
  @apply rounded-control bg-ink-surface p-6 text-center text-sm text-text-subtle;
}
.load-more {
  @apply mt-4 min-h-(--size-control) w-full rounded-control border border-border text-sm font-semibold text-text-muted hover:bg-ink-surface disabled:cursor-wait disabled:text-text-subtle;
}
.finish-dialog {
  @apply max-h-[75vh] w-full max-w-lg overflow-y-auto rounded-t-sheet bg-white p-5 text-left shadow-overlay sm:rounded-sheet;
}
.dialog-handle {
  @apply mx-auto mb-4 block h-1 w-12 rounded-full bg-ink-tint sm:hidden;
}
.finish-dialog h2 {
  @apply text-title font-semibold text-text;
}
.finish-dialog p {
  @apply mt-2 text-sm leading-6 text-text-subtle;
}
.finish-dialog button {
  @apply mt-3 inline-flex min-h-(--size-control) w-full items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold;
}
.finish-dialog button svg {
  @apply size-5;
}
.confirm-finish {
  @apply bg-ink text-white hover:bg-ink-strong;
}
.keep-training {
  @apply border border-border text-text-muted hover:bg-ink-surface;
}
.discard-workout {
  @apply border border-danger/30 text-danger hover:bg-danger-surface hover:text-danger-strong;
}
.confirm-discard {
  @apply bg-danger text-white hover:bg-danger;
}
@media (max-width: 520px) {
  .set-grid {
    @apply gap-1.5;
    grid-template-columns: 2.25rem minmax(4.5rem, 1fr) repeat(
        var(--metric-count),
        minmax(5.5rem, 0.75fr)
      );
  }
  .set-labels {
    @apply text-eyebrow;
  }
  .set-row input {
    @apply px-1;
  }
}
</style>
