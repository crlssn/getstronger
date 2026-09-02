import type { RoutineGroup } from '@/proto/api/v1/routine_service_pb'
import type { CreateWorkoutRequest } from '@/proto/api/v1/workout_service_pb'
import type { Set as WorkoutSet } from '@/types/workout'
import type { MeasurementField } from '@/utils/exerciseMeasurements'
import type {
  SavedGroup,
  SessionExercise,
  SessionGroup,
  SessionStation,
} from '@/utils/workoutSession'
import type { RefObject } from 'react'

import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { Code, ConnectError } from '@connectrpc/connect'
import {
  CheckIcon,
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
import {
  ExerciseSetsSchema,
  RoutineGroupMode,
  type Exercise,
  type ExerciseSets,
} from '@/proto/api/v1/shared_pb'
import {
  CreateWorkoutRequestSchema,
  WorkoutGroupSchema,
  WorkoutService,
  type WorkoutGroup,
} from '@/proto/api/v1/workout_service_pb'
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
import { AppOptionRow } from '@/ui/components/AppOptionRow'
import { AppOptionalAction } from '@/ui/components/AppOptionalAction'
import { AppSheet, SheetAction } from '@/ui/components/AppSheet'
import { AppTextarea } from '@/ui/components/AppTextarea'
import { ExerciseTags } from '@/ui/exercises/ExerciseTags'
import { ExercisePickerSheet } from '@/ui/workouts/ExercisePickerSheet'
import { RoundTable, type RoundRow } from '@/ui/workouts/RoundTable'
import { WorkoutRestBanner } from '@/ui/workouts/WorkoutRestBanner'
import { SetTable } from '@/ui/workouts/SetTable'
import blurActiveElement from '@/utils/blurActiveElement'
import { convertDistance, normalizeDistanceUnit } from '@/utils/distanceUnits'
import { formatExerciseSet, isExerciseSetComplete } from '@/utils/exerciseMeasurements'
import { isNumber } from '@/utils/numbers'
import { restRemainingSeconds } from '@/utils/restTimer'
import { convertWeight, normalizeWeightUnit } from '@/utils/weightUnits'
import { defaultRestSeconds } from '@/utils/routineGroups'
import {
  activeSetIndex,
  circuitRound,
  circuitRoundCount,
  completedCircuitRounds,
  elapsedLabel,
  finishBlocker,
  loggedSetCount,
  nextCircuitRound,
  nextStationOutsideGroup,
  nextUnfinishedStation,
  restExtensionSeconds,
  savedGroups,
  sessionGroups,
} from '@/utils/workoutSession'
import styles from './StartWorkout.module.css'

interface Session {
  name: string
  exercises: Exercise[]
  groups: RoutineGroup[]
}

const setKey = (stationKey: string, index: number) => `${stationKey}:${index}`

// The blocks the session was trained in. Each states how many of its exercise's
// sets it took; the sets themselves travel in exercise_sets, and one copy of
// them on the wire is enough.
const workoutGroupMessages = (groups: readonly SavedGroup[]): WorkoutGroup[] =>
  groups.map((group) =>
    create(WorkoutGroupSchema, {
      mode: group.mode === 'circuit' ? RoutineGroupMode.CIRCUIT : RoutineGroupMode.STRAIGHT,
      restBetweenExercisesSeconds: group.restBetweenExercisesSeconds,
      restBetweenRoundsSeconds: group.restBetweenRoundsSeconds,
      rounds: group.rounds,
      exercises: group.exercises.map((entry) => ({
        exercise: { id: entry.exerciseId },
        setCount: entry.setCount,
      })),
    }),
  )

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

/**
 * Gives every station the row it opens on, and the shape it is being worked to.
 *
 * Straight sets open on as many rows as the exercise took last session, which
 * is the session being repeated. A circuit's rows are its rounds, so every
 * station in it holds a row for each prescribed round and for the round the
 * block has reached — never one for a round nobody has walked yet, which would
 * lay out a round the session has not decided to take. A circuit already ended
 * keeps the rows it closed with.
 */
const fillEmptySets = (
  routineID: string,
  blocks: readonly SessionGroup[],
  previous: ExerciseSets[],
) => {
  const { weightUnit, distanceUnit } = usePreferencesStore.getState()
  const store = () => useWorkoutStore.getState()
  const done = selectCompletedExerciseIds(store(), routineID)

  blocks.forEach((block) => {
    const logged = Object.fromEntries(
      block.stations.map(({ key, exercise }) => [
        key,
        selectSets(store(), routineID, key).filter((set) => isExerciseSetComplete(set, exercise))
          .length,
      ]),
    )
    const circuitRows = Math.max(block.rounds, circuitRound(block, logged))

    block.stations.forEach(({ key, exercise }) => {
      if (block.mode === 'circuit' && done.includes(key)) return
      if (block.mode !== 'circuit') {
        store().addEmptySetIfNone(routineID, key, exercise.metrics, weightUnit, distanceUnit)
      }

      const rows =
        block.mode === 'circuit'
          ? circuitRows
          : (previous.find((entry) => entry.exercise?.id === exercise.id)?.sets.length ?? 0)

      for (let index = selectSets(store(), routineID, key).length; index < rows; index += 1) {
        store().addEmptySet(routineID, key, weightUnit, distanceUnit)
      }
    })
  })
}

const completedSetKeys = (routineID: string, stations: readonly SessionStation[]) => {
  const state = useWorkoutStore.getState()
  const keys = new Set<string>()

  stations.forEach(({ key, exercise }) => {
    selectSets(state, routineID, key).forEach((set, index) => {
      if (isExerciseSetComplete(set, exercise)) keys.add(setKey(key, index))
    })
  })

  return keys
}

/**
 * The round each circuit opens on when the session loads.
 *
 * The round the block has reached, or the last one it closed on. Read once
 * rather than derived on every render: a round fully logged is still the round
 * in front of you until it is completed, and a panel that moved on by itself
 * the moment the last field filled would take the button's job away from it.
 */
const initialOpenRounds = (routineID: string, blocks: readonly SessionGroup[]) => {
  const state = useWorkoutStore.getState()
  const rounds: Record<string, number> = {}

  blocks.forEach((block) => {
    if (block.mode !== 'circuit') return

    const logged: Record<string, number> = {}
    const counts: Record<string, number> = {}
    block.stations.forEach(({ key, exercise }) => {
      const sets = selectSets(state, routineID, key)
      counts[key] = sets.length
      logged[key] = sets.filter((set) => isExerciseSetComplete(set, exercise)).length
    })
    rounds[block.id] = Math.min(circuitRound(block, logged), circuitRoundCount(block, counts))
  })

  return rounds
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
  const [activeStationIndex, setActiveStationIndex] = useState(0)
  // The round each circuit has open, by block. Unset, a block opens on the
  // round it has reached; set, on the one the athlete chose to look at.
  const [openRounds, setOpenRounds] = useState<Record<string, number>>({})
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

  // The session in blocks: straight ones behave exactly as they always have,
  // circuits are walked a set at a time and counted in rounds. A station is one
  // exercise where the routine trains it, so an exercise in two groups is two
  // of them, each with its own sets.
  const blocks = useMemo(() => sessionGroups(session?.groups, exercises), [session, exercises])
  const stations = useMemo(() => blocks.flatMap((block) => block.stations), [blocks])
  const blockOf = useMemo(() => {
    const lookup = new Map<string, SessionGroup>()
    blocks.forEach((block) => block.stations.forEach(({ key }) => lookup.set(key, block)))
    return lookup
  }, [blocks])
  const stationIndex = useMemo(
    () => new Map(stations.map((station, index) => [station.key, index])),
    [stations],
  )

  const entries = useMemo<SessionExercise[]>(
    () => stations.map(({ key, exercise }) => ({ exercise, sets: allSets?.[key] ?? [] })),
    [stations, allSets],
  )
  const loggedCounts = useMemo(
    () =>
      Object.fromEntries(
        stations.map(({ key, exercise }) => [
          key,
          (allSets?.[key] ?? []).filter((set) => isExerciseSetComplete(set, exercise)).length,
        ]),
      ),
    [stations, allSets],
  )
  const setCounts = useMemo(
    () => Object.fromEntries(stations.map(({ key }) => [key, (allSets?.[key] ?? []).length])),
    [stations, allSets],
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
        setSession({ name: t('workout.quick'), exercises: current, groups: [] })

        const previous = current.length
          ? ((await getPreviousWorkoutSets(current.map(({ id }) => id)))?.exerciseSets ?? [])
          : []
        setPreviousSets(previous)

        const quickBlocks = sessionGroups([], current)
        fillEmptySets(routineID, quickBlocks, previous)
        completedSets.current = completedSetKeys(
          routineID,
          quickBlocks.flatMap((block) => block.stations),
        )
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
      setSession({
        name: routineRes.routine.name,
        exercises: current,
        groups: routineRes.routine.groups,
      })

      const previous =
        (await getPreviousWorkoutSets(current.map(({ id }) => id)))?.exerciseSets ?? []
      setPreviousSets(previous)

      const sessionBlocks = sessionGroups(routineRes.routine.groups, current)
      const sessionStations = sessionBlocks.flatMap((block) => block.stations)
      fillEmptySets(routineID, sessionBlocks, previous)
      completedSets.current = completedSetKeys(routineID, sessionStations)
      setOpenRounds(initialOpenRounds(routineID, sessionBlocks))

      const done = selectCompletedExerciseIds(store(), routineID)
      setActiveStationIndex(
        Math.max(
          0,
          sessionStations.findIndex((station) => !done.includes(station.key)),
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

  const activeStation = stations[activeStationIndex]
  const currentExercise = activeStation?.exercise
  const unfinishedCount = stations.filter((station) => !completed[station.key]).length
  const allExercisesComplete = unfinishedCount === 0

  const activeBlock = activeStation ? blockOf.get(activeStation.key) : undefined
  const inCircuit = activeBlock?.mode === 'circuit' && !allExercisesComplete
  const roundOf = (block: SessionGroup) => circuitRound(block, loggedCounts)
  const completedRoundsOf = (block: SessionGroup) => completedCircuitRounds(block, loggedCounts)
  const roundCountOf = (block: SessionGroup) => circuitRoundCount(block, setCounts)
  // The round a circuit shows open: the one pinned when the block was opened,
  // else the one it has reached — which, once a block is closed, is the last
  // one it took.
  const openRoundOf = (block: SessionGroup) =>
    Math.min(openRounds[block.id] ?? roundOf(block), roundCountOf(block))
  const activeRound = activeBlock ? openRoundOf(activeBlock) : 1

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
  const canFinish = stations.length > 0 && !blocker && !submitting
  const canRunPrimaryAction = allExercisesComplete ? canFinish : Boolean(activeStation)

  // Blocked, not disabled. A grey fill on the screen's dominant control reads as
  // broken rather than as waiting for something, so the button stays live and
  // says what is missing when it is pressed. Only finishing can block:
  // completing an exercise works from wherever you are.
  const blockedReason = !activeStation
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

  const nextIndex = nextUnfinishedStation(stations, completed, activeStationIndex)
  const circuitStep =
    inCircuit && activeBlock
      ? nextCircuitRound(activeBlock, openRoundOf(activeBlock), completedRoundsOf(activeBlock))
      : undefined
  // A circuit that closes here ticks off every exercise in it at once, so what
  // comes next is the first station outside the block rather than the one below.
  const nextStation =
    circuitStep?.kind === 'groupComplete'
      ? activeBlock && nextStationOutsideGroup(stations, activeBlock, completed)
      : circuitStep
        ? undefined
        : stations[nextIndex]
  const nextUpHint =
    circuitStep?.kind === 'nextRound'
      ? t('workout.thenRound', { round: circuitStep.round })
      : nextStation
        ? t('workout.thenNext', { name: nextStation.exercise.name })
        : t('workout.thenFinish')
  // The last round is the end of the block, not the way into another lap of
  // it, so the button says so.
  const closesCircuit = circuitStep?.kind === 'groupComplete'
  const primaryActionLabel = allExercisesComplete
    ? submitting
      ? t('common.saving')
      : t('workout.finish')
    : inCircuit
      ? closesCircuit
        ? t('workout.completeCircuit')
        : t('workout.completeRound')
      : t('workout.completeExercise')

  const setsFor = (key: string) => selectSets(useWorkoutStore.getState(), routineID, key)
  const previousSetsFor = (exerciseID: string) =>
    previousSets.find((entry) => entry.exercise?.id === exerciseID)?.sets
  const previousSetFor = (exerciseID: string, index: number) => previousSetsFor(exerciseID)?.[index]
  const loggedFor = ({ key, exercise }: SessionStation) =>
    setsFor(key).filter((set) => isExerciseSetComplete(set, exercise)).length

  const rememberCompletedSets = ({ key, exercise }: SessionStation) => {
    for (const entry of completedSets.current) {
      if (entry.startsWith(`${key}:`)) completedSets.current.delete(entry)
    }
    setsFor(key).forEach((set, index) => {
      if (isExerciseSetComplete(set, exercise)) completedSets.current.add(setKey(key, index))
    })
  }

  const startRest = (seconds = defaultRestSeconds) => {
    // Read at event time, never during render: this runs from completing a set,
    // moving on, or pressing "+30 sec". The compiler cannot follow that through
    // the handlers that reach it, so the check is silenced here rather than
    // every caller being reshaped to satisfy it.
    // eslint-disable-next-line react-hooks/purity
    const startedAt = Date.now()

    // The countdown is read off the ticking clock, and that clock last read
    // itself up to a second ago. Resetting it here is what makes a rest that
    // begins mid-second open on its full length rather than a second past it.
    setNow(startedAt)
    useWorkoutStore
      .getState()
      .setRestTimer(routineID, new Date(startedAt + seconds * 1000).toISOString(), seconds)
  }

  const startRestOrClear = (seconds: number) => {
    if (seconds > 0) startRest(seconds)
    else useWorkoutStore.getState().setRestTimer(routineID)
  }

  // The station already carries the rest between its sets: the routine's own
  // length where a routine trains it, and the app default otherwise.
  const startSetRest = (station?: SessionStation) => {
    startRestOrClear(station?.restSeconds ?? 0)
  }

  // Completing a set is what starts the rest, so it must fire on the crossing
  // and not on every keystroke that leaves the set complete.
  const syncSetCompletion = (station: SessionStation, index: number) => {
    const set = setsFor(station.key)[index]
    const key = setKey(station.key, index)

    if (set && isExerciseSetComplete(set, station.exercise)) {
      if (!completedSets.current.has(key)) {
        completedSets.current.add(key)
        const block = blockOf.get(station.key)
        if (block?.mode !== 'circuit') startSetRest(station)
        // In a circuit, a set logged inside a round is the walk to the next
        // exercise in it. The round's last set has nowhere to walk to: the
        // rest after it is the round's, and completing the round starts it.
        else if (roundStillOpen(block, station, index)) {
          startRestOrClear(block.restBetweenExercisesSeconds)
        }
      }
      return
    }

    completedSets.current.delete(key)
  }

  // Whether another exercise in the round still has its set to take.
  const roundStillOpen = (block: SessionGroup, station: SessionStation, index: number) =>
    block.stations.some(
      (other) =>
        other.key !== station.key &&
        !isExerciseSetComplete(setsFor(other.key)[index] ?? {}, other.exercise),
    )

  // Every station in the block holds a row for the round, so a round opened
  // early or on a reloaded draft has somewhere to write.
  const ensureRoundRows = (block: SessionGroup, round: number) => {
    const store = useWorkoutStore.getState()
    block.stations.forEach(({ key }) => {
      for (let count = setsFor(key).length; count < round; count += 1) {
        store.addEmptySet(routineID, key, weightUnit, distanceUnit)
      }
    })
  }

  const onSetChange = (station: SessionStation, index: number, changes: WorkoutSet) => {
    const store = useWorkoutStore.getState()
    const block = blockOf.get(station.key)

    setFinishError('')
    if (block?.mode === 'circuit') ensureRoundRows(block, index + 1)
    store.updateSet(routineID, station.key, index, changes)
    // A circuit's rows are its rounds, and a round is laid out when it is
    // reached rather than the moment the row above it fills.
    if (block?.mode !== 'circuit') {
      store.addEmptySetIfNone(
        routineID,
        station.key,
        station.exercise.metrics,
        weightUnit,
        distanceUnit,
      )
    }
    syncSetCompletion(station, index)
  }

  // Prefilling a field nobody typed into is opt-in, so an athlete who wants to
  // log what they actually did sees an empty row.
  const onFocusField = (
    station: SessionStation,
    index: number,
    field: MeasurementField,
    target: HTMLInputElement,
  ) => {
    if (!autofillSets || suppressFocusAutofill.current) return

    const sets = setsFor(station.key)
    if (isNumber(sets[index]?.[field])) return

    const previous = previousSetFor(station.exercise.id, index) ?? sets[index - 1]
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
    // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- see above: the caret placement depends on this render
    flushSync(() => onSetChange(station, index, changes))
    target.select()
  }

  const onRemoveSet = (station: SessionStation, index: number) => {
    useWorkoutStore.getState().deleteSet(routineID, station.key, index)
    rememberCompletedSets(station)
  }

  const selectStation = (index: number) => {
    const station = stations[index]
    if (!station || index === activeStationIndex) return

    // A circuit walked into from outside opens on the round it has reached,
    // and stays there until the round is completed or another is chosen.
    const block = blockOf.get(station.key)
    if (block?.mode === 'circuit') {
      const reached = openRoundOf(block)
      setOpenRounds((rounds) =>
        rounds[block.id] === undefined ? { ...rounds, [block.id]: reached } : rounds,
      )
    }
    setActiveStationIndex(index)
    setFocusRequest((request) => request + 1)
  }

  // Opening a round makes its block the session's place: the block's first
  // station stands for it wherever the session counts stations.
  const selectRound = (block: SessionGroup, round: number) => {
    const first = stationIndex.get(block.stations[0]?.key ?? '') ?? -1
    if (first < 0) return

    ensureRoundRows(block, round)
    setOpenRounds((rounds) => ({ ...rounds, [block.id]: round }))
    setActiveStationIndex(first)
    setFocusRequest((request) => request + 1)
  }

  // A row nobody finished is a row that would never have been saved, so
  // completing throws it away rather than standing in the way of moving on.
  const completeStation = (station: SessionStation) => {
    const store = useWorkoutStore.getState()
    const sets = setsFor(station.key)

    for (let index = sets.length - 1; index >= 0; index -= 1) {
      if (!isExerciseSetComplete(sets[index], station.exercise)) {
        store.deleteSet(routineID, station.key, index)
      }
    }
    rememberCompletedSets(station)
    store.setExerciseCompleted(routineID, station.key, true)
  }

  const reopenStation = ({ key, exercise }: SessionStation) => {
    const store = useWorkoutStore.getState()

    store.setExerciseCompleted(routineID, key, false)
    // Completing cleared the empty row, so reopening has to hand one back.
    store.addEmptySetIfNone(routineID, key, exercise.metrics, weightUnit, distanceUnit)
  }

  const moveToNextUnfinished = () => {
    const left = activeStation
    const done = selectCompletedExerciseIds(useWorkoutStore.getState(), routineID)
    const next = nextUnfinishedStation(
      stations,
      Object.fromEntries(done.map((key) => [key, true])),
      activeStationIndex,
    )
    if (next < 0) return

    selectStation(next)
    // The walk to the next exercise is the block's rest, not the next
    // exercise's: what is being rested from is the work just finished.
    startRestOrClear(left ? (blockOf.get(left.key)?.restBetweenExercisesSeconds ?? 0) : 0)
  }

  /**
   * Ends the circuit at the round it has reached, ticking off every exercise in
   * it at once — they were all being worked, so they are all done together.
   */
  const completeCircuit = (block: SessionGroup) => {
    block.stations.forEach((station) => completeStation(station))
    // Closed, the block shows the round it closed on rather than one chosen
    // while it was being worked.
    setOpenRounds((rounds) =>
      Object.fromEntries(Object.entries(rounds).filter(([id]) => id !== block.id)),
    )
    moveToNextUnfinished()
  }

  // Reopened, a circuit carries on from the round after the one it closed on.
  const reopenCircuit = (block: SessionGroup) => {
    const store = useWorkoutStore.getState()
    block.stations.forEach(({ key }) => store.setExerciseCompleted(routineID, key, false))
    selectRound(block, roundOf(block))
  }

  /**
   * One round of the circuit done: into the next, resting for the one that
   * closed.
   *
   * Nothing is ticked off on the way round, because an exercise in a circuit is
   * not finished with until the circuit is — and how many rounds that takes is
   * decided here, in the session, not in the routine.
   */
  const advanceCircuit = (block: SessionGroup) => {
    const step = nextCircuitRound(block, openRoundOf(block), completedRoundsOf(block))
    if (step.kind === 'groupComplete') {
      completeCircuit(block)
      return
    }

    selectRound(block, step.round)
    startRestOrClear(step.restSeconds)
  }

  const advanceExercise = () => {
    if (!activeStation) return

    const block = blockOf.get(activeStation.key)
    if (block?.mode === 'circuit') {
      advanceCircuit(block)
      return
    }

    completeStation(activeStation)
    moveToNextUnfinished()
  }

  /**
   * The session as the save describes it: the sets against the exercises that
   * took them, and the blocks that say how to read them.
   *
   * A workout records sets against an exercise, so the two stations of a
   * repeated exercise are saved as one exercise's worth of work — walked in
   * station order, which is what lets the blocks name their share of it.
   */
  const buildWorkout = () => {
    const stored = selectAllSets(useWorkoutStore.getState(), routineID)
    if (!stored) return { exerciseSets: [], groups: [] }

    const byExercise = new Map<string, WorkoutSet[]>()
    const setCounts: Record<string, number> = {}
    stations.forEach(({ key, exercise }) => {
      const sets = stored[key]?.filter((set) => isExerciseSetComplete(set, exercise)) ?? []
      setCounts[key] = sets.length
      if (!sets.length) return

      byExercise.set(exercise.id, [...(byExercise.get(exercise.id) ?? []), ...sets])
    })

    const exerciseSets = [...byExercise].map(([exerciseId, sets]) =>
      create(ExerciseSetsSchema, {
        exercise: { id: exerciseId },
        sets: sets.map((set) => ({
          reps: set.reps,
          weight: set.weight,
          distance: set.distance ?? 0,
          durationSeconds: set.durationSeconds ?? 0,
          weightUnit: normalizeWeightUnit(set.weightUnit ?? weightUnit),
          distanceUnit: normalizeDistanceUnit(set.distanceUnit ?? distanceUnit),
        })),
      }),
    )

    return { exerciseSets, groups: workoutGroupMessages(savedGroups(blocks, setCounts)) }
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
    // Saved on the device rather than the server; the offline banner carries
    // the not-yet-synced state while the toast reports the save itself.
    useToastStore.getState().success(t('workout.savedOffline'))
    await navigate('/home', { replace: true })
  }

  const onFinishWorkout = async () => {
    setFinishError('')
    if (!canFinish) {
      setFinishError(finishStatus)
      return
    }

    const { exerciseSets, groups } = buildWorkout()
    if (!exerciseSets.length) {
      setFinishError(t('workout.logCompleteSet'))
      return
    }

    setSubmitting(true)
    const request = create(CreateWorkoutRequestSchema, {
      exerciseSets,
      groups,
      finishedAt: timestampFromDate(new Date()),
      routineId: quickWorkout ? '' : routineID,
      startedAt: timestampFromDate(new Date(startedAtMs ?? Date.now())),
      note: workout?.note ?? '',
      planId: quickWorkout ? '' : (workout?.planId ?? ''),
      workoutName: quickWorkout ? t('workout.quick') : '',
      // The same key on every attempt, queued replay included: the server
      // answers a repeat with the workout it already saved.
      idempotencyKey: workout?.idempotencyKey,
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

  const onPrimaryAction = () => {
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
    setPickerOpen(false)

    const res = await getPreviousWorkoutSets([exercise.id])
    const previous = res ? [...previousSets, ...res.exerciseSets] : previousSets
    if (res) setPreviousSets(previous)

    // The exercise joins the session's last block, so its station is whatever
    // laying the session out again makes of it.
    fillEmptySets(routineID, sessionGroups(session.groups, current), previous)
  }

  // The one line a collapsed exercise gets: what it is waiting for, what it has
  // already taken, or that it is done.
  const stationStatus = (station: SessionStation) => {
    const logged = loggedFor(station)

    if (completed[station.key]) {
      return logged
        ? `${t('workout.exerciseCompleted')} · ${t('workout.loggedSets', { count: logged })}`
        : t('workout.exerciseCompleted')
    }

    if (logged) return t('workout.loggedSets', { count: logged })

    const previous = previousSetFor(station.exercise.id, 0)
    if (previous)
      return t('workout.lastSet', { set: formatExerciseSet(previous, station.exercise) })
    return t('workout.notStarted')
  }

  // A round's rows: every station's set for it, beside the same round of the
  // last session.
  const roundRows = (block: SessionGroup, round: number): RoundRow[] =>
    block.stations.map((station) => ({
      station,
      set: allSets?.[station.key]?.[round - 1],
      previous: previousSetFor(station.exercise.id, round - 1),
    }))

  const rowLogged = ({ station, set }: RoundRow) =>
    Boolean(set && isExerciseSetComplete(set, station.exercise))

  // The one line a collapsed round gets: what was logged in it, what it is
  // still waiting for, or that nobody has reached it.
  const roundStatus = (rows: readonly RoundRow[]) => {
    const logged = rows.filter(rowLogged).length

    if (logged === rows.length) {
      return rows
        .map(({ station, set }) => formatExerciseSet(set ?? {}, station.exercise))
        .join(' / ')
    }
    if (logged) return t('workout.roundLoggedOf', { count: logged, total: rows.length })
    return t('workout.notStarted')
  }

  // The one forward action lives inside the panel it acts on, so pressing
  // forward never means travelling past the page.
  const renderActions = (block: SessionGroup, done: boolean) => (
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
      {/* Described by the status rather than aria-disabled: the whole point is
          that this control is pressable, and aria-disabled would announce the
          same "broken" that a grey fill used to. */}
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
      {/* The label stays on the work in front of you; where the session goes
          next is a hint, not a promotion. */}
      {!allExercisesComplete && (
        <small id="workout-next-up" className={styles.nextUp}>
          {nextUpHint}
        </small>
      )}
      {/* A circuit runs for as many rounds as the session takes, so ending it
          is a decision — and it belongs next to the button that takes another
          round, which is where that decision is made. */}
      {block.mode === 'circuit' && !done && !closesCircuit && (
        <AppButton type="button" colour="secondary" onClick={() => completeCircuit(block)}>
          {t('workout.completeCircuit')}
        </AppButton>
      )}
    </div>
  )

  return (
    <form
      className={styles.workoutShell}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        onPrimaryAction()
      }}
    >
      {/* The session chrome carries the two things worth glancing at between
          sets: where you are, and how long you have been here. The elapsed time
          is the larger of the two because it is the one being read. */}
      {/* Header and rest bar are one piece of chrome, pinned together: the
          bar used to stick at the same offset with a higher z-index, so it
          rode up over the session title on scroll. */}
      <div className={styles.sessionChrome}>
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
                {inCircuit && activeBlock
                  ? t(
                      activeBlock.rounds > 0
                        ? 'workout.roundPositionOfRounds'
                        : 'workout.roundPosition',
                      { round: activeRound, rounds: activeBlock.rounds },
                    )
                  : t('workout.exercisePosition', {
                      current: Math.min(activeStationIndex + 1, stations.length),
                      total: stations.length,
                    })}
              </p>
            </div>
            {/* Two dark clocks running at once compete; while resting, the
                countdown is the one that matters, so the elapsed pill stands
                down until it is over. */}
            {restSeconds <= 0 && (
              <span className={styles.elapsed} aria-label={t('workout.elapsed')}>
                {elapsedLabel(elapsedSeconds)}
              </span>
            )}
          </div>
        </header>

        {restSeconds > 0 && (
          <div className={styles.restDock}>
            <WorkoutRestBanner
              remainingSeconds={restSeconds}
              totalSeconds={restTotalSeconds}
              onAddTime={() => startRest(restSeconds + restExtensionSeconds)}
              onSkip={() => useWorkoutStore.getState().setRestTimer(routineID)}
            />
          </div>
        )}
      </div>

      <main className={styles.exerciseStack}>
        {quickWorkout && !currentExercise && (
          <section className={styles.quickEmpty}>
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
        {/* One list per block. A straight block lists its exercises; a circuit
            lists its rounds, because a round — one set of every exercise, then
            round again — is the unit a circuit is worked in, and a list of
            exercises each with its sets hides exactly that. */}
        {blocks.map((block) =>
          block.mode === 'circuit' ? (
            <section key={block.id} className={styles.exerciseList}>
              <div className={styles.circuitBand}>
                <strong>{t('workout.circuit')}</strong>
                <span>{block.stations.map(({ exercise }) => exercise.name).join(' · ')}</span>
              </div>
              <ul>
                {Array.from({ length: roundCountOf(block) }, (_, index) => index + 1).map(
                  (round) => {
                    const rows = roundRows(block, round)
                    const blockDone = block.stations.every(({ key }) => completed[key])
                    // Only the block being worked has a round open, so the
                    // page still opens on exactly one thing.
                    const open = activeBlock?.id === block.id && round === openRoundOf(block)
                    const roundDone = rows.every(rowLogged)

                    return (
                      <li
                        key={round}
                        ref={open ? openItemRef : undefined}
                        className={cn(
                          styles.exerciseItem,
                          open && styles.open,
                          blockDone && styles.completed,
                        )}
                      >
                        <h2>
                          <AppOptionRow
                            className={styles.exerciseHeader}
                            aria-expanded={open}
                            aria-controls={`round-panel-${block.id}-${round}`}
                            leading={
                              <span className={styles.exerciseIndex}>
                                {roundDone ? <CheckIcon aria-hidden="true" /> : round}
                              </span>
                            }
                            trailing={
                              <ChevronDownIcon
                                className={styles.exerciseToggle}
                                aria-hidden="true"
                              />
                            }
                            onClick={() => selectRound(block, round)}
                          >
                            <strong className={styles.exerciseName}>
                              {t('workout.roundPosition', { round })}
                            </strong>
                            <small>{roundStatus(rows)}</small>
                          </AppOptionRow>
                        </h2>

                        {open && (
                          <div
                            id={`round-panel-${block.id}-${round}`}
                            ref={panelRef}
                            className={styles.exercisePanel}
                          >
                            {blockDone && (
                              <div className={styles.completedExercise}>
                                <div>
                                  <strong>{t('workout.circuitCompleted')}</strong>
                                  <p>
                                    {t('workout.roundsLogged', {
                                      count: completedRoundsOf(block),
                                    })}
                                  </p>
                                </div>
                                <AppButton
                                  type="button"
                                  colour="ghost"
                                  size="sm"
                                  width="auto"
                                  className={styles.reopenExercise}
                                  onClick={() => reopenCircuit(block)}
                                >
                                  {t('workout.reopen')}
                                </AppButton>
                              </div>
                            )}

                            <RoundTable
                              round={round}
                              rows={rows}
                              activeKey={rows.find((row) => !rowLogged(row))?.station.key}
                              weightUnit={weightUnit}
                              distanceUnit={distanceUnit}
                              onChange={(station, changes) =>
                                onSetChange(station, round - 1, changes)
                              }
                              onFocusField={(station, field, target) =>
                                onFocusField(station, round - 1, field, target)
                              }
                            />

                            {(!blockDone || allExercisesComplete || finishError) &&
                              renderActions(block, blockDone)}
                          </div>
                        )}
                      </li>
                    )
                  },
                )}
              </ul>
            </section>
          ) : (
            <section key={block.id} className={styles.exerciseList}>
              <ul>
                {block.stations.map((station) => {
                  const { key, exercise } = station
                  const index = stationIndex.get(key) ?? 0
                  const open = index === activeStationIndex
                  const sets = allSets?.[key] ?? []

                  return (
                    <li
                      key={key}
                      ref={open ? openItemRef : undefined}
                      className={cn(
                        styles.exerciseItem,
                        open && styles.open,
                        completed[key] && styles.completed,
                      )}
                    >
                      <h2>
                        <AppOptionRow
                          className={styles.exerciseHeader}
                          aria-expanded={open}
                          aria-controls={`exercise-panel-${index}`}
                          leading={<span className={styles.exerciseIndex}>{index + 1}</span>}
                          trailing={
                            <ChevronDownIcon className={styles.exerciseToggle} aria-hidden="true" />
                          }
                          onClick={() => selectStation(index)}
                        >
                          <strong className={styles.exerciseName}>{exercise.name}</strong>
                          <ExerciseTags compact tags={exercise.tags} />
                          <small>{stationStatus(station)}</small>
                        </AppOptionRow>
                      </h2>

                      {open && (
                        <div
                          id={`exercise-panel-${index}`}
                          ref={panelRef}
                          className={styles.exercisePanel}
                        >
                          {/* Ticked off, not hidden: the label sits above the sets
                              so a completed exercise still shows what was logged. */}
                          {completed[key] && (
                            <div className={styles.completedExercise}>
                              <div>
                                <strong>{t('workout.exerciseCompleted')}</strong>
                                <p>{t('workout.loggedSets', { count: loggedFor(station) })}</p>
                              </div>
                              <AppButton
                                type="button"
                                colour="ghost"
                                size="sm"
                                width="auto"
                                className={styles.reopenExercise}
                                onClick={() => reopenStation(station)}
                              >
                                {t('workout.reopen')}
                              </AppButton>
                            </div>
                          )}

                          <SetTable
                            exercise={exercise}
                            mode="log"
                            sets={sets}
                            previousSets={previousSetsFor(exercise.id)}
                            activeIndex={activeSetIndex(sets, exercise)}
                            weightUnit={weightUnit}
                            distanceUnit={distanceUnit}
                            onChange={(setIndex, changes) =>
                              onSetChange(station, setIndex, changes)
                            }
                            onFocusField={(setIndex, field, target) =>
                              onFocusField(station, setIndex, field, target)
                            }
                            onRemove={(setIndex) => onRemoveSet(station, setIndex)}
                          />

                          {(!completed[key] || allExercisesComplete || finishError) &&
                            renderActions(block, Boolean(completed[key]))}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ),
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
                the same place at the end of the page. Outlined rather than
                text-only — as ghost, the disabled state was grey text on grey
                with no border, indistinguishable from a caption, and this is
                the way out of the app's longest-lived screen. */}
            {!allExercisesComplete && (
              <AppButton
                type="button"
                colour="secondary"
                size="lg"
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
            <AppTextarea
              autosize
              id="workout-note"
              placeholder={t('workout.notePlaceholder')}
              rows={3}
              value={workout?.note ?? ''}
              onChange={(event) =>
                useWorkoutStore.getState().setNote(routineID, event.target.value)
              }
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
