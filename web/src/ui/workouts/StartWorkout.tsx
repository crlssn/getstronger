import type { CreateWorkoutRequest } from '@/proto/api/v1/workout_service_pb'
import type { Set as WorkoutSet } from '@/types/workout'
import type { MeasurementField } from '@/utils/exerciseMeasurements'
import type { SessionExercise } from '@/utils/workoutSession'
import type { RefObject } from 'react'

import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { Code, ConnectError } from '@connectrpc/connect'
import {
  ChevronDownIcon,
  FlagIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { isConnectivityError } from '@/http/offlineCache'
import {
  createWorkout,
  getCurrentUser,
  getExercise,
  getPreviousWorkoutSets,
  getRoutine,
} from '@/http/requests'
import posthog from '@/posthog'
import { ExerciseSetsSchema, type Exercise, type ExerciseSets } from '@/proto/api/v1/shared_pb'
import { CreateWorkoutRequestSchema, WorkoutService } from '@/proto/api/v1/workout_service_pb'
import { useActivityStore } from '@/stores/activity'
import { useToastStore } from '@/stores/toasts'
import { useAuthStore } from '@/stores/auth'
import { useConnectionStore } from '@/stores/connection'
import { useDashboardStore } from '@/stores/dashboard'
import { useMutationQueueStore } from '@/stores/mutationQueue'
import { usePageTitleStore } from '@/stores/pageTitle'
import { usePreferencesStore } from '@/stores/preferences'
import { useProgressStore } from '@/stores/progress'
import { useStreakStore } from '@/stores/streak'
import {
  quickWorkoutRoutineID,
  selectAddedExercises,
  selectAllSets,
  selectCompletedExerciseIds,
  selectSets,
  useWorkoutStore,
} from '@/stores/workout'
import { cn } from '@/ui/cn'
import { AppButton } from '@/ui/components/AppButton'
import { AppIconButton } from '@/ui/components/AppIconButton'
import { AppOptionalAction } from '@/ui/components/AppOptionalAction'
import { AppSheet, SheetAction } from '@/ui/components/AppSheet'
import { ExerciseTags } from '@/ui/exercises/ExerciseTags'
import { ExercisePickerSheet } from '@/ui/workouts/ExercisePickerSheet'
import { WorkoutRestBanner } from '@/ui/workouts/WorkoutRestBanner'
import { WorkoutSetGrid } from '@/ui/workouts/WorkoutSetGrid'
import { autosize } from '@/utils/autosize'
import blurActiveElement from '@/utils/blurActiveElement'
import { convertDistance, normalizeDistanceUnit } from '@/utils/distanceUnits'
import { formatExerciseSet, isExerciseSetComplete } from '@/utils/exerciseMeasurements'
import { isNumber } from '@/utils/numbers'
import { restRemainingSeconds } from '@/utils/restTimer'
import { convertWeight, normalizeWeightUnit } from '@/utils/weightUnits'
import {
  activeSetIndex,
  defaultRestSeconds,
  elapsedLabel,
  finishBlocker,
  loggedSetCount,
  nextUnfinishedIndex,
  restExtensionSeconds,
} from '@/utils/workoutSession'
import styles from './StartWorkout.module.css'

interface Session {
  name: string
  exercises: Exercise[]
}

const setKey = (exerciseID: string, index: number) => `${exerciseID}:${index}`

const millisecondsOf = (iso: string | undefined) => {
  const time = Date.parse(iso ?? '')
  return Number.isNaN(time) ? undefined : time
}

/**
 * Puts the cursor on the set about to be logged.
 *
 * The focus this moves is the app's, not the user's, so it is flagged: an
 * autofilled value completes a set, a completed set starts the next rest, and
 * the workout would log itself with nobody touching the screen. A field already
 * being typed into is never taken away.
 */
const focusNextSetInput = (panel: HTMLElement | null, suppress: RefObject<boolean>) => {
  if (document.activeElement instanceof HTMLInputElement) return

  for (const input of panel?.querySelectorAll<HTMLInputElement>('input') ?? []) {
    if (input.value) continue

    suppress.current = true
    try {
      input.focus()
    } finally {
      suppress.current = false
    }
    return
  }
}

/** Tops every exercise up to one blank row, and to as many as it had last time. */
const fillEmptySets = (routineID: string, exercises: Exercise[], previous: ExerciseSets[]) => {
  const { weightUnit, distanceUnit } = usePreferencesStore.getState()
  const store = () => useWorkoutStore.getState()

  exercises.forEach((exercise) =>
    store().addEmptySetIfNone(routineID, exercise.id, exercise.metrics, weightUnit, distanceUnit),
  )

  previous.forEach((entry) => {
    if (!entry.exercise) return

    const logged = selectSets(store(), routineID, entry.exercise.id).length
    for (let index = logged; index < entry.sets.length; index += 1) {
      store().addEmptySet(routineID, entry.exercise.id, weightUnit, distanceUnit)
    }
  })
}

const completedSetKeys = (routineID: string, exercises: Exercise[]) => {
  const state = useWorkoutStore.getState()
  const keys = new Set<string>()

  exercises.forEach((exercise) => {
    selectSets(state, routineID, exercise.id).forEach((set, index) => {
      if (isExerciseSetComplete(set, exercise)) keys.add(setKey(exercise.id, index))
    })
  })

  return keys
}

/**
 * The session itself: the live workout being logged, set by set.
 *
 * The whole app leads here. The screen owns the two clocks (elapsed and rest),
 * the exercise list with exactly one exercise open, and the finish flow — which
 * always pauses on a sheet, because that sheet is where the note is written.
 */
export const StartWorkout = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { routine_id: routineParam } = useParams()
  const [searchParams] = useSearchParams()

  const quickWorkout = !routineParam
  const routineID = routineParam ?? quickWorkoutRoutineID
  const requestedPlanID = searchParams.get('plan_id') ?? ''

  const workout = useWorkoutStore((state) => state.workouts[routineID])
  const weightUnit = usePreferencesStore((state) => state.weightUnit)
  const distanceUnit = usePreferencesStore((state) => state.distanceUnit)
  const autofillSets = usePreferencesStore((state) => state.autofillSets)

  const [session, setSession] = useState<Session>()
  const [previousSets, setPreviousSets] = useState<ExerciseSets[]>([])
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [submitting, setSubmitting] = useState(false)
  const [finishError, setFinishError] = useState('')
  const [blockedMessage, setBlockedMessage] = useState('')
  const [finishDialogOpen, setFinishDialogOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)

  const savedWorkoutId = useRef('')
  const completedSets = useRef(new Set<string>())
  const suppressFocusAutofill = useRef(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const openItemRef = useRef<HTMLLIElement>(null)
  const retiredRest = useRef<number | undefined>(undefined)

  const exercises = useMemo(() => session?.exercises ?? [], [session])
  const completedIds = workout?.completedExerciseIds
  const completed = useMemo(
    () => Object.fromEntries((completedIds ?? []).map((id) => [id, true])),
    [completedIds],
  )

  const allSets = workout?.exerciseSets
  const entries = useMemo<SessionExercise[]>(
    () => exercises.map((exercise) => ({ exercise, sets: allSets?.[exercise.id] ?? [] })),
    [exercises, allSets],
  )

  useEffect(() => {
    const initialise = async () => {
      const store = () => useWorkoutStore.getState()

      const res = await getCurrentUser(useAuthStore.getState().userId)
      if (res?.user) {
        const preferences = usePreferencesStore.getState()
        preferences.setWeightUnit(res.user.weightUnit)
        preferences.setDistanceUnit(res.user.distanceUnit)
        preferences.setAutofillSets(res.user.autofillSets)
      }

      const preferred = usePreferencesStore.getState()
      store().syncWeightUnits(routineID, preferred.weightUnit)
      store().syncDistanceUnits(routineID, preferred.distanceUnit)

      if (quickWorkout) {
        usePageTitleStore.getState().setPageTitle(t('workout.quick'))
        store().initialiseWorkout(routineID)

        // The draft holds the exercises as they were when they were added, so
        // each is re-read in case its name or metrics have changed since.
        const saved = selectAddedExercises(store(), routineID)
        const current = await Promise.all(
          saved.map(async (entry) => (await getExercise(entry.id))?.exercise ?? entry),
        )
        current.forEach((exercise) => store().addWorkoutExercise(routineID, exercise))
        setSession({ name: t('workout.quick'), exercises: current })

        const previous = current.length
          ? ((await getPreviousWorkoutSets(current.map(({ id }) => id)))?.exerciseSets ?? [])
          : []
        setPreviousSets(previous)
        fillEmptySets(routineID, current, previous)
        completedSets.current = completedSetKeys(routineID, current)
        return
      }

      const routineRes = await getRoutine(routineID)
      if (!routineRes?.routine) {
        await navigate('/routines')
        return
      }

      usePageTitleStore.getState().setPageTitle(routineRes.routine.name)
      store().initialiseWorkout(routineID, requestedPlanID)

      // Exercises added to a previous sitting of this routine belong to the
      // draft, not the routine, so they are appended rather than saved back.
      const current = [...routineRes.routine.exercises]
      selectAddedExercises(store(), routineID).forEach((added) => {
        if (!current.some((entry) => entry.id === added.id)) current.push(added)
      })
      setSession({ name: routineRes.routine.name, exercises: current })

      const previous =
        (await getPreviousWorkoutSets(current.map(({ id }) => id)))?.exerciseSets ?? []
      setPreviousSets(previous)
      fillEmptySets(routineID, current, previous)
      completedSets.current = completedSetKeys(routineID, current)

      const done = selectCompletedExerciseIds(store(), routineID)
      setActiveExerciseIndex(
        Math.max(
          0,
          current.findIndex((entry) => !done.includes(entry.id)),
        ),
      )
    }

    void initialise()
  }, [routineID, quickWorkout, requestedPlanID, t, navigate])

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  const restEndsAtMs = millisecondsOf(workout?.restTimerEndsAt)
  const restTotalSeconds = workout?.restTimerTotalSeconds ?? 0
  const restSeconds = restRemainingSeconds(now, restEndsAtMs)

  // Each timer is retired once, or the effect would fire again on every tick
  // after it ran out and keep grabbing focus.
  useEffect(() => {
    if (!restEndsAtMs || restRemainingSeconds(now, restEndsAtMs) > 0) return
    if (retiredRest.current === restEndsAtMs) return

    retiredRest.current = restEndsAtMs
    useWorkoutStore.getState().setRestTimer(routineID)
    focusNextSetInput(panelRef.current, suppressFocusAutofill)
  }, [now, restEndsAtMs, routineID])

  // The panel that just opened can be taller than the screen, so its header is
  // brought back into view rather than the top of the page.
  useEffect(() => {
    if (!focusRequest) return

    openItemRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    focusNextSetInput(panelRef.current, suppressFocusAutofill)
  }, [focusRequest])

  const startedAtMs = millisecondsOf(workout?.startedAt)
  const elapsedSeconds = startedAtMs ? Math.max(0, Math.floor((now - startedAtMs) / 1000)) : 0

  const currentExercise = exercises[activeExerciseIndex]
  const unfinishedCount = exercises.filter((exercise) => !completed[exercise.id]).length
  const allExercisesComplete = unfinishedCount === 0

  const blocker = finishBlocker(session ? entries : undefined, quickWorkout)
  const finishStatus = !blocker
    ? ''
    : blocker.reason === 'loading'
      ? t('workout.loadingRoutine')
      : blocker.reason === 'noExercises'
        ? t('workout.noExercises')
        : blocker.reason === 'partialSets'
          ? t('workout.completePartialSets', { count: blocker.count })
          : t('workout.logOneSetToFinish')

  // A workout with nothing in it is not "ready to finish": `finishBlocker`
  // leaves an empty quick workout unblocked because there is nothing to fix
  // there, only something to add.
  const canFinish = exercises.length > 0 && !blocker && !submitting
  const canRunPrimaryAction = allExercisesComplete ? canFinish : Boolean(currentExercise)

  // Blocked, not disabled. A grey fill on the screen's dominant control reads as
  // broken rather than as waiting for something, so the button stays live and
  // says what is missing when it is pressed. Only finishing can block:
  // completing an exercise works from wherever you are.
  const blockedReason = !currentExercise
    ? t('workout.blockedNoExercise')
    : allExercisesComplete
      ? finishStatus
      : ''
  // A message about what is missing outlives its usefulness the moment it stops
  // being missing. A message about a save that failed does not.
  const shownBlocked = canRunPrimaryAction ? '' : blockedMessage
  // Only the finish-related hints are worth surfacing unprompted; while
  // logging, the empty set field is the instruction.
  const primaryStatus = allExercisesComplete ? finishStatus : ''
  const statusMessage = finishError || shownBlocked || primaryStatus

  const nextIndex = nextUnfinishedIndex(exercises, completed, activeExerciseIndex)
  const nextExercise = exercises[nextIndex]
  const nextUpHint = nextExercise
    ? t('workout.thenNext', { name: nextExercise.name })
    : t('workout.thenFinish')
  const primaryActionLabel = !allExercisesComplete
    ? t('workout.completeExercise')
    : submitting
      ? t('common.saving')
      : t('workout.finish')

  const setsFor = (exerciseID: string) =>
    selectSets(useWorkoutStore.getState(), routineID, exerciseID)
  const previousSetsFor = (exerciseID: string) =>
    previousSets.find((entry) => entry.exercise?.id === exerciseID)?.sets
  const previousSetFor = (exerciseID: string, index: number) => previousSetsFor(exerciseID)?.[index]
  const loggedFor = (exercise: Exercise) =>
    setsFor(exercise.id).filter((set) => isExerciseSetComplete(set, exercise)).length

  const rememberCompletedSets = (exercise: Exercise) => {
    for (const key of completedSets.current) {
      if (key.startsWith(`${exercise.id}:`)) completedSets.current.delete(key)
    }
    setsFor(exercise.id).forEach((set, index) => {
      if (isExerciseSetComplete(set, exercise))
        completedSets.current.add(setKey(exercise.id, index))
    })
  }

  const startRest = (seconds = defaultRestSeconds) => {
    const startedAt = Date.now()

    // The countdown is read off the ticking clock, and that clock last read
    // itself up to a second ago. Resetting it here is what makes a rest that
    // begins mid-second open on its full length rather than a second past it.
    setNow(startedAt)
    useWorkoutStore
      .getState()
      .setRestTimer(routineID, new Date(startedAt + seconds * 1000).toISOString(), seconds)
  }

  const startExerciseRest = (exercise?: Exercise) => {
    if (exercise?.restSeconds) startRest(exercise.restSeconds)
    else useWorkoutStore.getState().setRestTimer(routineID)
  }

  // Completing a set is what starts the rest, so it must fire on the crossing
  // and not on every keystroke that leaves the set complete.
  const syncSetCompletion = (exercise: Exercise, index: number) => {
    const set = setsFor(exercise.id)[index]
    const key = setKey(exercise.id, index)

    if (set && isExerciseSetComplete(set, exercise)) {
      if (!completedSets.current.has(key)) {
        completedSets.current.add(key)
        startExerciseRest(exercise)
      }
      return
    }

    completedSets.current.delete(key)
  }

  const onSetChange = (exercise: Exercise, index: number, changes: WorkoutSet) => {
    const store = useWorkoutStore.getState()

    setFinishError('')
    store.updateSet(routineID, exercise.id, index, changes)
    store.addEmptySetIfNone(routineID, exercise.id, exercise.metrics, weightUnit, distanceUnit)
    syncSetCompletion(exercise, index)
  }

  // Prefilling a field nobody typed into is opt-in, so an athlete who wants to
  // log what they actually did sees an empty row.
  const onFocusField = (
    exercise: Exercise,
    index: number,
    field: MeasurementField,
    target: HTMLInputElement,
  ) => {
    if (!autofillSets || suppressFocusAutofill.current) return

    const sets = setsFor(exercise.id)
    if (isNumber(sets[index]?.[field])) return

    const previous = previousSetFor(exercise.id, index) ?? sets[index - 1]
    if (!previous) return

    const changes: WorkoutSet = {}
    if (field === 'weight' && isNumber(previous.weight)) {
      // The previous set may have been logged under an older preference, so the
      // value is converted. The unit is written alongside it: a weight and the
      // unit it is expressed in must never be set independently.
      changes.weight = convertWeight(
        Number(previous.weight),
        normalizeWeightUnit(previous.weightUnit),
        weightUnit,
      )
      changes.weightUnit = weightUnit
    } else if (field === 'distance' && isNumber(previous.distance)) {
      changes.distance = convertDistance(
        Number(previous.distance),
        normalizeDistanceUnit(previous.distanceUnit),
        distanceUnit,
      )
      changes.distanceUnit = distanceUnit
    } else {
      changes[field] = previous[field]
    }

    // Flushed rather than deferred: the copied value has to be in the input,
    // and selected, before this focus returns. A render left until the next
    // tick lands after the caret has been placed, so the first character typed
    // is appended to the copied number instead of replacing it.
    flushSync(() => onSetChange(exercise, index, changes))
    target.select()
  }

  const onRemoveSet = (exercise: Exercise, index: number) => {
    useWorkoutStore.getState().deleteSet(routineID, exercise.id, index)
    rememberCompletedSets(exercise)
  }

  const selectExercise = (index: number) => {
    if (!exercises[index] || index === activeExerciseIndex) return

    setActiveExerciseIndex(index)
    setFocusRequest((request) => request + 1)
  }

  // A row nobody finished is a row that would never have been saved, so
  // completing throws it away rather than standing in the way of moving on.
  const completeExercise = (exercise: Exercise) => {
    const store = useWorkoutStore.getState()
    const sets = setsFor(exercise.id)

    for (let index = sets.length - 1; index >= 0; index -= 1) {
      if (!isExerciseSetComplete(sets[index], exercise)) {
        store.deleteSet(routineID, exercise.id, index)
      }
    }
    rememberCompletedSets(exercise)
    store.setExerciseCompleted(routineID, exercise.id, true)
  }

  const reopenExercise = (exercise: Exercise) => {
    const store = useWorkoutStore.getState()

    store.setExerciseCompleted(routineID, exercise.id, false)
    // Completing cleared the empty row, so reopening has to hand one back.
    store.addEmptySetIfNone(routineID, exercise.id, exercise.metrics, weightUnit, distanceUnit)
  }

  const advanceExercise = () => {
    if (!currentExercise) return

    completeExercise(currentExercise)

    const done = selectCompletedExerciseIds(useWorkoutStore.getState(), routineID)
    const next = nextUnfinishedIndex(
      exercises,
      Object.fromEntries(done.map((id) => [id, true])),
      activeExerciseIndex,
    )
    if (next < 0) return

    selectExercise(next)
    startExerciseRest(exercises[next])
  }

  const buildWorkoutSets = () => {
    const stored = selectAllSets(useWorkoutStore.getState(), routineID)
    if (!stored) return []

    return exercises
      .map((exercise) => {
        const sets = stored[exercise.id]?.filter((set) => isExerciseSetComplete(set, exercise))
        if (!sets?.length) return undefined

        return create(ExerciseSetsSchema, {
          exercise: { id: exercise.id },
          sets: sets.map((set) => ({
            reps: set.reps,
            weight: set.weight,
            distance: set.distance ?? 0,
            durationSeconds: set.durationSeconds ?? 0,
            weightUnit: normalizeWeightUnit(set.weightUnit ?? weightUnit),
            distanceUnit: normalizeDistanceUnit(set.distanceUnit ?? distanceUnit),
          })),
        })
      })
      .filter((entry) => entry !== undefined)
  }

  const openSavedWorkout = async (workoutId: string) => {
    try {
      await navigate(`/workouts/${workoutId}`, { replace: true })
    } catch {
      setFinishError(t('workout.savedNotOpened'))
      return
    }

    useWorkoutStore.getState().removeWorkout(routineID)
    void useDashboardStore.getState().load()
    useStreakStore.getState().reset()
    useActivityStore.getState().reset()
    useProgressStore.getState().reset()
  }

  // Finishing must not depend on the network: the request is queued for
  // delivery on reconnect and the workout is treated as saved on this device.
  const finishWorkoutOffline = async (request: CreateWorkoutRequest) => {
    useMutationQueueStore.getState().enqueue(WorkoutService.method.createWorkout, request)
    useConnectionStore.getState().setOnline(false)
    useWorkoutStore.getState().removeWorkout(routineID)
    // Not a success yet: the workout is on the device and not on the server.
    useToastStore.getState().info(t('workout.savedOffline'))
    await navigate('/home', { replace: true })
  }

  const onFinishWorkout = async () => {
    setFinishError('')
    if (!canFinish) {
      setFinishError(finishStatus)
      return
    }

    const exerciseSets = buildWorkoutSets()
    if (!exerciseSets.length) {
      setFinishError(t('workout.logCompleteSet'))
      return
    }

    setSubmitting(true)
    const request = create(CreateWorkoutRequestSchema, {
      exerciseSets,
      finishedAt: timestampFromDate(new Date()),
      routineId: quickWorkout ? '' : routineID,
      startedAt: timestampFromDate(new Date(startedAtMs ?? Date.now())),
      note: workout?.note ?? '',
      planId: quickWorkout ? '' : (workout?.planId ?? ''),
      workoutName: quickWorkout ? t('workout.quick') : '',
    })

    try {
      // The workout is already on the server: pressing finish again must open
      // it rather than save a second copy of it.
      if (savedWorkoutId.current) {
        await openSavedWorkout(savedWorkoutId.current)
        return
      }

      const res = await createWorkout(request)
      if (!res) {
        setFinishError(t('workout.saveFailed'))
        return
      }

      const workoutId = res.workoutId.trim()
      if (!workoutId) {
        setFinishError(t('workout.savedWithoutId'))
        return
      }

      savedWorkoutId.current = workoutId
      posthog.capture('workout_completed', {
        exercise_count: exerciseSets.length,
        logged_set_count: loggedSetCount(entries),
        workout_type: quickWorkout ? 'quick' : 'routine',
      })
      useToastStore.getState().success(t('workout.saved'))
      await openSavedWorkout(workoutId)
    } catch (error) {
      console.error('failed to finish workout', error)
      if (!savedWorkoutId.current && isConnectivityError(error)) {
        await finishWorkoutOffline(request)
        return
      }

      if (savedWorkoutId.current) {
        setFinishError(t('workout.savedNotOpened'))
      } else if (
        quickWorkout &&
        error instanceof ConnectError &&
        error.code === Code.InvalidArgument &&
        error.message.includes('routine_id')
      ) {
        setFinishError(t('workout.quickWorkoutUnavailable'))
      } else if (error instanceof ConnectError && error.code === Code.DeadlineExceeded) {
        setFinishError(t('workout.saveTimedOut'))
      } else {
        setFinishError(t('workout.saveFailed'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Finishing always pauses on the confirmation sheet: it carries the workout
  // note, so the save is never one accidental tap away.
  const requestFinishWorkout = () => {
    setFinishError('')
    if (!canFinish) {
      setFinishError(finishStatus)
      return
    }

    blurActiveElement()
    setFinishDialogOpen(true)
  }

  const onPrimaryAction = async () => {
    if (!canRunPrimaryAction) {
      setBlockedMessage(blockedReason)
      return
    }

    setBlockedMessage('')
    if (!allExercisesComplete) {
      advanceExercise()
      return
    }

    requestFinishWorkout()
  }

  const closeLeaveDialog = () => {
    setDiscardConfirmationOpen(false)
    setLeaveDialogOpen(false)
  }

  const addExerciseToWorkout = async (exercise: Exercise) => {
    if (!session || exercises.some((entry) => entry.id === exercise.id)) return

    const store = useWorkoutStore.getState()
    const current = [...exercises, exercise]

    setSession({ ...session, exercises: current })
    store.addWorkoutExercise(routineID, exercise)
    store.addEmptySetIfNone(routineID, exercise.id, exercise.metrics, weightUnit, distanceUnit)
    setPickerOpen(false)

    const res = await getPreviousWorkoutSets([exercise.id])
    if (!res) return

    const previous = [...previousSets, ...res.exerciseSets]
    setPreviousSets(previous)
    fillEmptySets(routineID, current, previous)
  }

  // The one line a collapsed exercise gets: what it is waiting for, what it has
  // already taken, or that it is done.
  const exerciseStatus = (exercise: Exercise) => {
    const logged = loggedFor(exercise)

    if (completed[exercise.id]) {
      return logged
        ? `${t('workout.exerciseCompleted')} · ${t('workout.loggedSets', { count: logged })}`
        : t('workout.exerciseCompleted')
    }
    if (logged) return t('workout.loggedSets', { count: logged })

    const previous = previousSetFor(exercise.id, 0)
    if (previous) return `${t('common.previous')} ${formatExerciseSet(previous, exercise)}`
    return t('workout.notStarted')
  }

  return (
    <form
      className={cn(styles.workoutShell, restSeconds > 0 && styles.resting)}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void onPrimaryAction()
      }}
    >
      {/* The session chrome carries the two things worth glancing at between
          sets: where you are, and how long you have been here. The elapsed time
          is the larger of the two because it is the one being read. */}
      <header className={styles.workoutHeader}>
        <div className={styles.workoutHeaderInner}>
          <AppIconButton
            className={styles.leaveWorkout}
            icon={XMarkIcon}
            label={t('workout.leaveTitle')}
            onClick={() => {
              blurActiveElement()
              setDiscardConfirmationOpen(false)
              setLeaveDialogOpen(true)
            }}
          />
          <div className="min-w-0">
            <h1>{session?.name ?? t('workout.loading')}</h1>
            <p className={styles.sessionProgress}>
              {t('workout.exercisePosition', {
                current: Math.min(activeExerciseIndex + 1, exercises.length),
                total: exercises.length,
              })}
            </p>
          </div>
          <span className={styles.elapsed} aria-label={t('workout.elapsed')}>
            {elapsedLabel(elapsedSeconds)}
          </span>
        </div>
      </header>

      <WorkoutRestBanner
        remainingSeconds={restSeconds}
        totalSeconds={restTotalSeconds}
        onAddTime={() => startRest(restSeconds + restExtensionSeconds)}
        onSkip={() => useWorkoutStore.getState().setRestTimer(routineID)}
      />

      <main className={styles.exerciseStack}>
        {quickWorkout && !currentExercise && (
          <section className={styles.quickEmpty}>
            <span>
              <PlusIcon aria-hidden="true" />
            </span>
            <h2>{t('workout.addFirstExercise')}</h2>
            <p>{t('workout.addFirstExerciseBody')}</p>
            <AppButton
              type="button"
              colour="primary"
              size="lg"
              className="mt-2"
              onClick={() => setPickerOpen(true)}
            >
              <PlusIcon className="size-5" aria-hidden="true" /> {t('workout.chooseExercise')}
            </AppButton>
          </section>
        )}

        {/* One connected list holding every exercise in the session, with
            exactly one open. Tapping any collapsed header opens it and closes
            whichever was open: the primary action is the guided path through
            the session, not a gate on leaving the exercise you are in. */}
        {exercises.length > 0 && (
          <section className={styles.exerciseList}>
            <ul>
              {exercises.map((exercise, index) => {
                const open = index === activeExerciseIndex
                const sets = allSets?.[exercise.id] ?? []

                return (
                  <li
                    key={exercise.id}
                    ref={open ? openItemRef : undefined}
                    className={cn(
                      styles.exerciseItem,
                      open && styles.open,
                      completed[exercise.id] && styles.completed,
                    )}
                  >
                    <h2>
                      <button
                        type="button"
                        className={styles.exerciseHeader}
                        aria-expanded={open}
                        aria-controls={`exercise-panel-${index}`}
                        onClick={() => selectExercise(index)}
                      >
                        <span className={styles.exerciseIndex}>{index + 1}</span>
                        <span className={styles.exerciseCopy}>
                          <strong className={styles.exerciseName}>{exercise.name}</strong>
                          <ExerciseTags compact tags={exercise.tags} />
                          <small>{exerciseStatus(exercise)}</small>
                        </span>
                        <ChevronDownIcon className={styles.exerciseToggle} aria-hidden="true" />
                      </button>
                    </h2>

                    {open && (
                      <div
                        id={`exercise-panel-${index}`}
                        ref={panelRef}
                        className={styles.exercisePanel}
                      >
                        {/* Ticked off, not hidden: the label sits above the sets
                            so a completed exercise still shows what was logged. */}
                        {completed[exercise.id] && (
                          <div className={styles.completedExercise}>
                            <div>
                              <strong>{t('workout.exerciseCompleted')}</strong>
                              <p>{t('workout.loggedSets', { count: loggedFor(exercise) })}</p>
                            </div>
                            <AppButton
                              type="button"
                              colour="ghost"
                              size="sm"
                              width="auto"
                              className={styles.reopenExercise}
                              onClick={() => reopenExercise(exercise)}
                            >
                              {t('workout.reopen')}
                            </AppButton>
                          </div>
                        )}

                        <WorkoutSetGrid
                          exercise={exercise}
                          sets={sets}
                          previousSets={previousSetsFor(exercise.id)}
                          activeIndex={activeSetIndex(sets, exercise)}
                          weightUnit={weightUnit}
                          distanceUnit={distanceUnit}
                          onChange={(setIndex, changes) => onSetChange(exercise, setIndex, changes)}
                          onFocusField={(setIndex, field, target) =>
                            onFocusField(exercise, setIndex, field, target)
                          }
                          onRemove={(setIndex) => onRemoveSet(exercise, setIndex)}
                        />

                        {/* The one forward action lives inside the exercise it
                            acts on, so pressing forward never means travelling
                            past the page. */}
                        {(!completed[exercise.id] || allExercisesComplete || finishError) && (
                          <div className={styles.actionBlock}>
                            {statusMessage && (
                              <strong
                                id="workout-dock-status"
                                className={cn(
                                  finishError && styles.failed,
                                  !finishError && shownBlocked && styles.blocked,
                                )}
                              >
                                {statusMessage}
                              </strong>
                            )}
                            {/* Described by the status rather than
                                aria-disabled: the whole point is that this
                                control is pressable, and aria-disabled would
                                announce the same "broken" that a grey fill used
                                to. */}
                            <AppButton
                              type="submit"
                              colour="primary"
                              size="lg"
                              aria-describedby={
                                [
                                  statusMessage ? 'workout-dock-status' : '',
                                  allExercisesComplete ? '' : 'workout-next-up',
                                ]
                                  .filter(Boolean)
                                  .join(' ') || undefined
                              }
                              disabled={submitting}
                            >
                              {primaryActionLabel}
                            </AppButton>
                            {/* The label stays on the exercise in front of you;
                                where the session goes next is a hint, not a
                                promotion. */}
                            {!allExercisesComplete && (
                              <small id="workout-next-up" className={styles.nextUp}>
                                {nextUpHint}
                              </small>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {(!quickWorkout || exercises.length > 0) && (
          <section className={styles.workoutTools}>
            <AppOptionalAction
              label={t('workout.addExercise')}
              hint={t('workout.onlyThisWorkout')}
              onClick={() => {
                blurActiveElement()
                setPickerOpen(true)
              }}
            />

            {/* The escape hatch: quieter than everything above it, but always in
                the same place at the end of the page. */}
            {!allExercisesComplete && (
              <AppButton
                type="button"
                colour="ghost"
                disabled={!canFinish}
                title={canFinish ? undefined : finishStatus}
                aria-label={
                  !canFinish && finishStatus
                    ? `${t('workout.finish')}: ${finishStatus}`
                    : t('workout.finish')
                }
                onClick={requestFinishWorkout}
              >
                {t('workout.finish')}
              </AppButton>
            )}
          </section>
        )}
      </main>

      {pickerOpen && (
        <ExercisePickerSheet
          excluded={exercises.map(({ id }) => id)}
          onAdd={(exercise) => void addExerciseToWorkout(exercise)}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {finishDialogOpen && (
        <AppSheet
          title={unfinishedCount > 0 ? t('workout.finishEarly') : t('workout.finishConfirm')}
          body={
            unfinishedCount > 0
              ? t('workout.finishEarlyBody', { count: unfinishedCount })
              : undefined
          }
          onClose={() => setFinishDialogOpen(false)}
          actions={
            <>
              <SheetAction
                tone="primary"
                onClick={() => {
                  setFinishDialogOpen(false)
                  void onFinishWorkout()
                }}
              >
                <FlagIcon aria-hidden="true" /> {t('workout.finishSave')}
              </SheetAction>
              <SheetAction tone="tertiary" onClick={() => setFinishDialogOpen(false)}>
                {t('workout.keepTraining')}
              </SheetAction>
            </>
          }
        >
          <div className={styles.noteField}>
            <label htmlFor="workout-note">
              {t('workout.note')} <span>{t('common.optional')}</span>
            </label>
            <textarea
              id="workout-note"
              ref={autosize}
              value={workout?.note ?? ''}
              placeholder={t('workout.notePlaceholder')}
              onChange={(event) => {
                autosize(event.currentTarget)
                useWorkoutStore.getState().setNote(routineID, event.target.value)
              }}
            />
          </div>
        </AppSheet>
      )}

      {leaveDialogOpen &&
        (discardConfirmationOpen ? (
          <AppSheet
            eyebrow={t('workout.discard')}
            eyebrowTone="danger"
            title={t('workout.deleteTitle')}
            body={t('workout.discardBody')}
            onClose={closeLeaveDialog}
            actions={
              <>
                <SheetAction
                  tone="danger"
                  onClick={() => {
                    useWorkoutStore.getState().removeWorkout(routineID)
                    closeLeaveDialog()
                    void navigate('/workout')
                  }}
                >
                  <TrashIcon aria-hidden="true" /> {t('workout.discard')}
                </SheetAction>
                <SheetAction tone="tertiary" onClick={() => setDiscardConfirmationOpen(false)}>
                  {t('common.back')}
                </SheetAction>
              </>
            }
          />
        ) : (
          <AppSheet
            eyebrow={t('workout.autosaved')}
            title={t('workout.leaveTitle')}
            body={t('workout.leaveBody')}
            onClose={closeLeaveDialog}
            actions={
              <>
                {/* The workout keeps running in the background; home is where
                    the banner and the nav badge that lead back to it live. */}
                <SheetAction
                  tone="primary"
                  onClick={() => {
                    closeLeaveDialog()
                    void navigate('/home')
                  }}
                >
                  {t('workout.continueInBackground')}
                </SheetAction>
                <SheetAction tone="dangerOutline" onClick={() => setDiscardConfirmationOpen(true)}>
                  {t('workout.discard')}
                </SheetAction>
                <SheetAction tone="tertiary" onClick={closeLeaveDialog}>
                  {t('workout.stay')}
                </SheetAction>
              </>
            }
          />
        ))}
    </form>
  )
}
