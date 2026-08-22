// @vitest-environment jsdom

import { create } from '@bufbuild/protobuf'
import { ConnectError } from '@connectrpc/connect'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  createWorkout: vi.fn(),
  getCurrentUser: vi.fn(),
  getExercise: vi.fn(),
  getPreviousWorkoutSets: vi.fn(),
  getRoutine: vi.fn(),
  listExercises: vi.fn(),
}))

import * as requests from '@/http/requests'
import {
  GetRoutineResponseSchema,
  RoutineGroupMode,
  RoutineSchema,
} from '@/proto/api/v1/routine_service_pb'
import {
  DistanceUnit,
  ExerciseMetric,
  ExerciseSchema,
  ExerciseSetsSchema,
  WeightUnit,
} from '@/proto/api/v1/shared_pb'
import { GetUserResponseSchema } from '@/proto/api/v1/user_service_pb'
import {
  GetPreviousWorkoutSetsResponseSchema,
  ListExercisesResponseSchema,
} from '@/proto/api/v1/exercise_service_pb'
import { CreateWorkoutResponseSchema } from '@/proto/api/v1/workout_service_pb'
import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import { useMutationQueueStore } from '@/stores/mutationQueue'
import { usePreferencesStore } from '@/stores/preferences'
import { useWorkoutStore } from '@/stores/workout'
import { renderWithProviders } from '@/ui/testing'
import { StartWorkout } from './StartWorkout'

const mocked = {
  createWorkout: vi.mocked(requests.createWorkout),
  getCurrentUser: vi.mocked(requests.getCurrentUser),
  getExercise: vi.mocked(requests.getExercise),
  getPreviousWorkoutSets: vi.mocked(requests.getPreviousWorkoutSets),
  getRoutine: vi.mocked(requests.getRoutine),
  listExercises: vi.mocked(requests.listExercises),
}

const routineID = 'routine-1'
const now = new Date('2026-08-16T12:00:00Z')

const benchPress = create(ExerciseSchema, {
  id: 'exercise-bench',
  name: 'Bench Press',
  metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
  restSeconds: 90,
})

const squat = create(ExerciseSchema, {
  id: 'exercise-squat',
  name: 'Squat',
  metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
})

const running = create(ExerciseSchema, {
  id: 'exercise-running',
  name: 'Running',
  metrics: [ExerciseMetric.DISTANCE, ExerciseMetric.TIME],
})

const routineOf = (name: string, exercises = [benchPress, squat]) =>
  create(GetRoutineResponseSchema, { routine: create(RoutineSchema, { name, exercises }) })

const currentUser = (
  weightUnit: WeightUnit,
  extra: Partial<{
    distanceUnit: DistanceUnit
    autofillSets: boolean
  }> = {},
) => create(GetUserResponseSchema, { user: { weightUnit, ...extra } })

const renderWorkout = async (route = `/workouts/routine/${routineID}`, name = 'Push Day') => {
  const result = renderWithProviders(
    <Routes>
      <Route path="/workouts/routine/:routine_id" element={<StartWorkout />} />
      <Route path="/workouts/quick" element={<StartWorkout />} />
      <Route path="/workouts/:id" element={<p>saved workout</p>} />
      <Route path="/home" element={<p>home</p>} />
      <Route path="/workout" element={<p>workout tab</p>} />
      <Route path="/routines" element={<p>routines</p>} />
    </Routes>,
    { route },
  )

  await screen.findByRole('heading', { level: 1, name })
  return result
}

// Bench and squat taken one set each in turn, resting between stations and
// again once the lap closes, for as many rounds as the session takes.
const circuitRoutine = () =>
  create(GetRoutineResponseSchema, {
    routine: create(RoutineSchema, {
      name: 'Push Day',
      exercises: [benchPress, squat],
      groups: [
        {
          id: 'group-circuit',
          mode: RoutineGroupMode.CIRCUIT,
          restBetweenExercisesSeconds: 15,
          restBetweenRoundsSeconds: 120,
          exercises: [benchPress, squat],
        },
      ],
    }),
  })

const setField = (label: string) => screen.getByRole('textbox', { name: label })

// The escape hatch in the tools shares its label, so the one inside the open
// exercise is identified by being the form's submit.
const primaryAction = () =>
  screen
    .getAllByRole('button', { name: /Complete exercise|Complete set|Finish workout|Saving/ })
    .find((button) => button.getAttribute('type') === 'submit')!

const restBanner = () => screen.queryByRole('region', { name: 'Rest timer' })

const logFirstSet = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(setField('Bench Press set 1 weight'), '80')
  await user.type(setField('Bench Press set 1 reps'), '8')
}

const completeBothExercises = async (user: ReturnType<typeof userEvent.setup>) => {
  await logFirstSet(user)
  await user.click(primaryAction())
  await user.type(await screen.findByRole('textbox', { name: 'Squat set 1 weight' }), '100')
  await user.type(setField('Squat set 1 reps'), '5')
  await user.click(primaryAction())
}

describe('StartWorkout', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(now)

    Object.values(mocked).forEach((mock) => mock.mockReset())
    mocked.getCurrentUser.mockResolvedValue(currentUser(WeightUnit.KILOGRAMS))
    mocked.getRoutine.mockResolvedValue(routineOf('Push Day'))
    mocked.getPreviousWorkoutSets.mockResolvedValue(
      create(GetPreviousWorkoutSetsResponseSchema, {}),
    )
    mocked.getExercise.mockResolvedValue(undefined)
    mocked.listExercises.mockResolvedValue(create(ListExercisesResponseSchema, {}))
    mocked.createWorkout.mockResolvedValue(
      create(CreateWorkoutResponseSchema, { workoutId: 'workout-1' }),
    )

    vi.spyOn(useDashboardStore.getState(), 'load').mockResolvedValue(undefined)
    useAuthStore.setState({ userId: 'user-me' })
    useWorkoutStore.setState({ workouts: {} })
    usePreferencesStore.getState().reset()
    useMutationQueueStore.setState({ pending: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('session chrome', () => {
    test('says where you are and how long you have been here', async () => {
      await renderWorkout()

      expect(screen.getByText('Exercise 1 of 2')).toBeInTheDocument()
      expect(screen.getByLabelText('Elapsed')).toHaveTextContent(/^\d+:\d{2}$/)
    })

    test('offers the way out through the leave sheet', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      await user.click(screen.getByRole('button', { name: 'Leave workout?' }))

      const sheet = screen.getByRole('dialog')
      expect(within(sheet).getByText('Autosaved')).toBeInTheDocument()
      expect(
        within(sheet).getByRole('button', { name: 'Continue in the background' }),
      ).toBeVisible()
    })

    test('leaves the workout running when the session is left in the background', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      await user.click(screen.getByRole('button', { name: 'Leave workout?' }))
      await user.click(screen.getByRole('button', { name: 'Continue in the background' }))

      expect(screen.getByText('home')).toBeInTheDocument()
      expect(useWorkoutStore.getState().workouts[routineID]).toBeDefined()
    })

    test('discards the draft only behind a second confirmation', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      await user.click(screen.getByRole('button', { name: 'Leave workout?' }))
      await user.click(screen.getByRole('button', { name: 'Discard workout' }))

      expect(screen.getByRole('heading', { name: 'Delete this workout?' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Discard workout' }))

      expect(screen.getByText('workout tab')).toBeInTheDocument()
      expect(useWorkoutStore.getState().workouts[routineID]).toBeUndefined()
    })
  })

  describe('circuits', () => {
    beforeEach(() => {
      mocked.getRoutine.mockResolvedValue(circuitRoutine())
    })

    test('counts rounds rather than exercises', async () => {
      await renderWorkout()

      expect(screen.getByText('Round 1 · exercise 1 of 2')).toBeInTheDocument()
      expect(screen.getByText('Circuit')).toBeInTheDocument()
    })

    // A circuit has no round count to lay rows out from, and a row for a round
    // nobody has walked would take the emphasis that says "type here next".
    test('opens on one row, whatever was logged last time', async () => {
      mocked.getPreviousWorkoutSets.mockResolvedValue(
        create(GetPreviousWorkoutSetsResponseSchema, {
          exerciseSets: [
            create(ExerciseSetsSchema, {
              exercise: { id: benchPress.id },
              sets: Array.from({ length: 6 }, () => ({ reps: 8, weight: 80 })),
            }),
          ],
        }),
      )
      await renderWorkout()

      expect(setField('Bench Press set 1 weight')).toBeVisible()
      expect(
        screen.queryByRole('textbox', { name: 'Bench Press set 2 weight' }),
      ).not.toBeInTheDocument()
    })

    test('grows the next row as the set in front of you is filled in', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      await logFirstSet(user)

      expect(setField('Bench Press set 2 weight')).toBeVisible()
    })

    test('walks to the next exercise instead of finishing the one in front of you', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      await logFirstSet(user)
      await user.click(primaryAction())

      // Still the first round: the round only turns over once every exercise in
      // it has taken its set.
      expect(screen.getByText('Round 1 · exercise 2 of 2')).toBeInTheDocument()
      expect(await screen.findByRole('textbox', { name: 'Squat set 1 weight' })).toBeVisible()
      expect(useWorkoutStore.getState().workouts[routineID]?.completedExerciseIds ?? []).toEqual([])
    })

    test('rests for the walk between exercises and for the round that closed', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      await logFirstSet(user)
      // The set alone starts nothing: a circuit rests on the way to the next
      // station, not the moment the numbers are in.
      expect(restBanner()).not.toBeInTheDocument()

      await user.click(primaryAction())
      expect(within(restBanner()!).getByText('00:15')).toBeInTheDocument()

      await user.type(await screen.findByRole('textbox', { name: 'Squat set 1 weight' }), '100')
      await user.type(setField('Squat set 1 reps'), '5')
      await user.click(primaryAction())

      expect(within(restBanner()!).getByText('02:00')).toBeInTheDocument()
      expect(screen.getByText('Round 2 · exercise 1 of 2')).toBeInTheDocument()
    })

    // A circuit runs until it is ended: taking another round is always the next
    // step, however many have been taken.
    test('goes round again rather than running out', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      await completeBothExercises(user)

      expect(screen.getByText('Round 2 · exercise 1 of 2')).toBeInTheDocument()
      expect(useWorkoutStore.getState().workouts[routineID]?.completedExerciseIds ?? []).toEqual([])
      expect(primaryAction()).toHaveTextContent('Complete set')
    })

    test('ends the circuit when the session says so, ticking off every exercise in it', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      await logFirstSet(user)
      await user.click(screen.getByRole('button', { name: 'Complete circuit' }))

      expect(useWorkoutStore.getState().workouts[routineID]?.completedExerciseIds).toEqual([
        benchPress.id,
        squat.id,
      ])
      expect(primaryAction()).toHaveTextContent('Finish workout')
    })

    // Ending a circuit is a decision to make while you are in one.
    test('offers no way to end a circuit that is already over', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      await logFirstSet(user)
      await user.click(screen.getByRole('button', { name: 'Complete circuit' }))

      expect(screen.queryByRole('button', { name: 'Complete circuit' })).not.toBeInTheDocument()
    })
  })

  // The same exercise in two groups is two pieces of work: two rows, two sets of
  // sets, and one exercise on the record that comes out of it.
  describe('an exercise trained in two groups', () => {
    beforeEach(() => {
      mocked.getRoutine.mockResolvedValue(
        create(GetRoutineResponseSchema, {
          routine: create(RoutineSchema, {
            name: 'Push Day',
            exercises: [benchPress, benchPress, squat],
            groups: [
              {
                id: 'group-warmup',
                mode: RoutineGroupMode.STRAIGHT,
                exercises: [benchPress],
              },
              {
                id: 'group-circuit',
                mode: RoutineGroupMode.CIRCUIT,
                exercises: [benchPress, squat],
              },
            ],
          }),
        }),
      )
    })

    test('logs each of them on its own', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      await logFirstSet(user)
      await user.click(primaryAction())

      // The second bench press opens with an empty row of its own rather than
      // the set that was just logged against the first.
      const second = await screen.findAllByRole('textbox', { name: /Bench Press set 1 weight/ })
      expect(second).toHaveLength(1)
      expect(second[0]).toHaveValue('')

      const sets = useWorkoutStore.getState().workouts[routineID]?.exerciseSets ?? {}
      expect(sets[benchPress.id]?.filter((set) => set.weight)).toHaveLength(1)
      expect(sets[`${benchPress.id}#2`]?.filter((set) => set.weight) ?? []).toHaveLength(0)
    })

    test('saves them as one exercise on the workout', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      await logFirstSet(user)
      await user.click(primaryAction())

      await user.type(setField('Bench Press set 1 weight'), '70')
      await user.type(setField('Bench Press set 1 reps'), '10')
      await user.click(screen.getAllByRole('button', { name: 'Finish workout' })[0]!)
      await user.click(screen.getByRole('button', { name: 'Finish and save' }))

      await waitFor(() => expect(mocked.createWorkout).toHaveBeenCalled())
      const request = mocked.createWorkout.mock.calls[0]![0]
      const bench = request.exerciseSets.filter((entry) => entry.exercise?.id === benchPress.id)
      expect(bench).toHaveLength(1)
      expect(bench[0]?.sets).toHaveLength(2)
    })
  })

  describe('rest timer', () => {
    test('bands the top of the session once a set with a rest time completes', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      expect(restBanner()).not.toBeInTheDocument()
      await logFirstSet(user)

      const banner = restBanner()
      expect(banner).toBeInTheDocument()
      expect(within(banner!).getByText('01:30')).toBeInTheDocument()
    })

    test('extends by thirty seconds and skips', async () => {
      const user = userEvent.setup()
      await renderWorkout()
      await logFirstSet(user)

      await user.click(within(restBanner()!).getByRole('button', { name: '+30 sec' }))
      expect(within(restBanner()!).getByText('02:00')).toBeInTheDocument()
      expect(useWorkoutStore.getState().workouts[routineID]?.restTimerTotalSeconds).toBe(120)

      await user.click(within(restBanner()!).getByRole('button', { name: 'Skip' }))
      expect(restBanner()).not.toBeInTheDocument()
      expect(useWorkoutStore.getState().workouts[routineID]?.restTimerEndsAt).toBeUndefined()
    })

    test('restores a persisted timer on mount', async () => {
      useWorkoutStore.setState({
        workouts: {
          [routineID]: {
            startedAt: now.toISOString(),
            restTimerEndsAt: new Date(now.getTime() + 45_000).toISOString(),
            restTimerTotalSeconds: 90,
          },
        },
      })

      await renderWorkout()

      expect(within(restBanner()!).getByText('00:45')).toBeInTheDocument()
    })

    test('clears the timer once the rest is over', async () => {
      useWorkoutStore.setState({
        workouts: {
          [routineID]: {
            startedAt: now.toISOString(),
            restTimerEndsAt: new Date(now.getTime() + 2_000).toISOString(),
            restTimerTotalSeconds: 90,
          },
        },
      })
      await renderWorkout()

      act(() => {
        vi.advanceTimersByTime(3_000)
      })

      expect(restBanner()).not.toBeInTheDocument()
      expect(useWorkoutStore.getState().workouts[routineID]?.restTimerEndsAt).toBeUndefined()
    })

    // An exercise with no rest of its own moves straight on rather than
    // inheriting the previous exercise's countdown.
    test('starts no rest for an exercise that names none', async () => {
      const user = userEvent.setup()
      mocked.getRoutine.mockResolvedValue(routineOf('Push Day', [squat]))
      await renderWorkout()

      await user.type(setField('Squat set 1 weight'), '100')
      await user.type(setField('Squat set 1 reps'), '5')

      expect(restBanner()).not.toBeInTheDocument()
    })
  })

  describe('the exercise list', () => {
    test('holds every exercise, with exactly one of them open', async () => {
      await renderWorkout()

      expect(screen.getByRole('button', { name: /Bench Press/ })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
      expect(screen.getByRole('button', { name: /Squat/ })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
      expect(setField('Bench Press set 1 weight')).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: 'Squat set 1 weight' })).not.toBeInTheDocument()
    })

    test('opens whichever header is tapped, without completing anything first', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      await user.click(screen.getByRole('button', { name: /Squat/ }))

      expect(setField('Squat set 1 weight')).toBeInTheDocument()
      expect(
        screen.queryByRole('textbox', { name: 'Bench Press set 1 weight' }),
      ).not.toBeInTheDocument()
      expect(useWorkoutStore.getState().workouts[routineID]?.completedExerciseIds ?? []).toEqual([])

      await user.click(screen.getByRole('button', { name: /Bench Press/ }))
      expect(setField('Bench Press set 1 weight')).toBeInTheDocument()
    })

    test('reports what a collapsed exercise is waiting for', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      expect(screen.getAllByText('Not started')).toHaveLength(2)

      await logFirstSet(user)
      await user.click(primaryAction())

      expect(await screen.findByText('Exercise completed · 1 set logged')).toBeInTheDocument()
    })

    test('keeps a completed exercise ticked off above its sets', async () => {
      const user = userEvent.setup()
      await renderWorkout()
      await completeBothExercises(user)

      const panel = screen.getByRole('button', { name: /Squat/ }).closest('li')!
      expect(within(panel).getByText('Exercise completed')).toBeInTheDocument()
      expect(setField('Squat set 1 weight')).toBeInTheDocument()
    })

    test('gives a reopened exercise a row to type into again', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      await user.click(primaryAction())
      await user.click(await screen.findByRole('button', { name: 'Complete exercise' }))
      expect(useWorkoutStore.getState().workouts[routineID]?.exerciseSets?.[squat.id]).toHaveLength(
        0,
      )

      await user.click(screen.getByRole('button', { name: 'Reopen' }))

      expect(setField('Squat set 1 weight')).toBeInTheDocument()
    })
  })

  describe('moving through the session', () => {
    test('keeps the label on the exercise and puts what follows in a hint', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      expect(primaryAction()).toHaveTextContent('Complete exercise')
      expect(screen.getByText('then: Squat')).toBeInTheDocument()

      await logFirstSet(user)
      await user.click(primaryAction())

      expect(await screen.findByText('then: finish')).toBeInTheDocument()

      await user.type(setField('Squat set 1 weight'), '100')
      await user.type(setField('Squat set 1 reps'), '5')
      await user.click(primaryAction())

      expect(primaryAction()).toHaveTextContent('Finish workout')
      expect(screen.queryByText('then: finish')).not.toBeInTheDocument()
    })

    test('discards a half-typed row instead of standing in its way', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      await user.type(setField('Bench Press set 1 weight'), '80')
      await user.click(primaryAction())

      const sets = useWorkoutStore.getState().workouts[routineID]?.exerciseSets
      expect(sets?.[benchPress.id]).toHaveLength(0)
      expect(await screen.findByRole('textbox', { name: 'Squat set 1 weight' })).toBeInTheDocument()
    })

    test('keeps every logged set and drops only the trailing empty row', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      await logFirstSet(user)
      expect(
        useWorkoutStore.getState().workouts[routineID]?.exerciseSets?.[benchPress.id],
      ).toHaveLength(2)

      await user.click(primaryAction())

      const sets = useWorkoutStore.getState().workouts[routineID]?.exerciseSets?.[benchPress.id]
      expect(sets).toHaveLength(1)
      expect(sets?.[0].weight).toBe(80)
    })

    // Blocked, not disabled: the dominant control stays live and says what is
    // missing when it is pressed.
    test('says what is missing rather than greying the button out', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      await user.click(primaryAction())
      await user.click(await screen.findByRole('button', { name: 'Complete exercise' }))

      const finish = screen.getByRole('button', { name: 'Finish workout' })
      expect(finish).toBeEnabled()

      await user.click(finish)
      expect(screen.getByText('Log at least one set to finish')).toBeInTheDocument()
      expect(mocked.createWorkout).not.toHaveBeenCalled()
    })

    test('removes a set row on request', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      await logFirstSet(user)
      await user.click(screen.getByRole('button', { name: 'Remove set 1' }))

      const sets = useWorkoutStore.getState().workouts[routineID]?.exerciseSets?.[benchPress.id]
      expect(sets).toHaveLength(1)
      expect(sets?.[0].weight).toBeUndefined()
    })
  })

  describe('previous values', () => {
    beforeEach(() => {
      mocked.getPreviousWorkoutSets.mockResolvedValue(
        create(GetPreviousWorkoutSetsResponseSchema, {
          exerciseSets: [
            create(ExerciseSetsSchema, {
              exercise: { id: benchPress.id },
              sets: [{ reps: 8, weight: 42.5, weightUnit: WeightUnit.KILOGRAMS }],
            }),
          ],
        }),
      )
    })

    test('shows the previous session values inside the set rows', async () => {
      await renderWorkout()

      expect(screen.getByText('42.5 kg · 8')).toBeInTheDocument()
    })

    test('leaves an empty field empty on focus unless the account asked for the prefill', async () => {
      const user = userEvent.setup()
      await renderWorkout()

      const weight = setField('Bench Press set 1 weight')
      await user.click(weight)

      expect(weight).toHaveValue('')
    })

    test('copies the previous value into an empty field on focus only', async () => {
      mocked.getCurrentUser.mockResolvedValue(
        currentUser(WeightUnit.KILOGRAMS, { autofillSets: true }),
      )
      const user = userEvent.setup()
      await renderWorkout()

      const weight = setField('Bench Press set 1 weight')
      await user.click(weight)
      expect(weight).toHaveValue('42.5')

      await user.clear(weight)
      await user.type(weight, '80')
      await user.tab()
      await user.click(weight)
      expect(weight).toHaveValue('80')
    })

    // The copy has to land inside the focus event. Deferred to a later tick it
    // arrives after the caret has been placed, and the first character typed
    // on a fast tap-and-type is appended to the copied number rather than
    // replacing it — 42.5 typed over as "42.580".
    test('leaves the copied value selected before anything can be typed over it', async () => {
      mocked.getCurrentUser.mockResolvedValue(
        currentUser(WeightUnit.KILOGRAMS, { autofillSets: true }),
      )
      await renderWorkout()

      const weight = setField('Bench Press set 1 weight') as HTMLInputElement
      act(() => {
        weight.focus()
      })

      expect(weight).toHaveValue('42.5')
      expect([weight.selectionStart, weight.selectionEnd]).toEqual([0, 4])
    })

    // The focus a finished rest moves is the app's, not the user's: a copied
    // value completes the set, and a completed set starts another rest — a
    // workout that logs itself while the phone sits in a pocket.
    test('does not autofill when the ended rest timer moves focus along', async () => {
      mocked.getCurrentUser.mockResolvedValue(
        currentUser(WeightUnit.KILOGRAMS, { autofillSets: true }),
      )
      const user = userEvent.setup()
      await renderWorkout()
      await logFirstSet(user)
      await user.tab()

      act(() => {
        vi.advanceTimersByTime(91_000)
      })

      expect(setField('Bench Press set 2 weight')).toHaveValue('')
    })

    test('corrects a completed set without restarting the rest timer', async () => {
      const user = userEvent.setup()
      await renderWorkout()
      await logFirstSet(user)

      const endsAt = useWorkoutStore.getState().workouts[routineID]?.restTimerEndsAt
      expect(endsAt).toBeDefined()

      // Typed over the selection rather than cleared first: emptying the field
      // uncompletes the set, and completing it again is what starts a rest.
      const weight = setField('Bench Press set 1 weight')
      await user.type(weight, '85', { initialSelectionStart: 0, initialSelectionEnd: 2 })

      expect(
        useWorkoutStore.getState().workouts[routineID]?.exerciseSets?.[benchPress.id]?.[0].weight,
      ).toBe(85)
      expect(useWorkoutStore.getState().workouts[routineID]?.restTimerEndsAt).toBe(endsAt)
    })
  })

  describe('units', () => {
    test('shows the unit from the profile preference as a static suffix', async () => {
      mocked.getCurrentUser.mockResolvedValue(currentUser(WeightUnit.POUNDS))
      await renderWorkout()

      await waitFor(() => expect(screen.getAllByText('lbs')[0]).toBeInTheDocument())
    })

    test('logs new sets using the profile preference unit', async () => {
      mocked.getCurrentUser.mockResolvedValue(currentUser(WeightUnit.POUNDS))
      const user = userEvent.setup()
      await renderWorkout()
      await logFirstSet(user)

      expect(
        useWorkoutStore.getState().workouts[routineID]?.exerciseSets?.[benchPress.id]?.[0]
          .weightUnit,
      ).toBe(WeightUnit.POUNDS)
    })

    // A draft outlives the screen: leaving a workout keeps it on the device, so
    // the preference can change before the athlete comes back.
    test('converts a resumed draft saved under the previous preference', async () => {
      useWorkoutStore.setState({
        workouts: {
          [routineID]: {
            startedAt: now.toISOString(),
            exerciseSets: {
              [benchPress.id]: [{ weight: 100, reps: 8, weightUnit: WeightUnit.POUNDS }],
            },
          },
        },
      })
      await renderWorkout()

      await waitFor(() => {
        const set = useWorkoutStore.getState().workouts[routineID]?.exerciseSets?.[benchPress.id]
        expect(set?.[0].weight).toBe(45.36)
        expect(set?.[0].weightUnit).toBe(WeightUnit.KILOGRAMS)
      })
      expect(screen.getAllByText('kg')[0]).toBeInTheDocument()
    })

    test('maps distance to a suffixed decimal input and time to a duration input', async () => {
      mocked.getCurrentUser.mockResolvedValue(
        currentUser(WeightUnit.KILOGRAMS, { distanceUnit: DistanceUnit.MILES }),
      )
      mocked.getRoutine.mockResolvedValue(routineOf('Cardio', [running]))
      const user = userEvent.setup()
      await renderWorkout(`/workouts/routine/${routineID}`, 'Cardio')

      await waitFor(() => expect(screen.getAllByText('mi')[0]).toBeInTheDocument())
      expect(setField('Running set 1 distance')).toHaveAttribute('inputmode', 'decimal')
      expect(setField('Running set 1 time')).toHaveAttribute('placeholder', 'm:ss')

      await user.type(setField('Running set 1 distance'), '3.5')
      await user.type(setField('Running set 1 time'), '12:30')

      const set = useWorkoutStore.getState().workouts[routineID]?.exerciseSets?.[running.id]?.[0]
      expect(set?.distance).toBe(3.5)
      expect(set?.durationSeconds).toBe(750)
      expect(set?.distanceUnit).toBe(DistanceUnit.MILES)
    })
  })

  describe('finishing', () => {
    test('always confirms through the sheet and collects the note there', async () => {
      const user = userEvent.setup()
      await renderWorkout()
      await completeBothExercises(user)

      await user.click(screen.getByRole('button', { name: 'Finish workout' }))
      expect(mocked.createWorkout).not.toHaveBeenCalled()

      await user.type(screen.getByRole('textbox', { name: /Workout note/ }), 'Felt strong today.')
      expect(useWorkoutStore.getState().workouts[routineID]?.note).toBe('Felt strong today.')

      await user.click(screen.getByRole('button', { name: 'Finish and save' }))

      await waitFor(() => expect(mocked.createWorkout).toHaveBeenCalledTimes(1))
      expect(mocked.createWorkout.mock.calls[0]?.[0].note).toBe('Felt strong today.')
      expect(await screen.findByText('saved workout')).toBeInTheDocument()
      expect(useWorkoutStore.getState().workouts[routineID]).toBeUndefined()
    })

    test('warns that exercises are unfinished when finishing early', async () => {
      const user = userEvent.setup()
      await renderWorkout()
      await logFirstSet(user)

      await user.click(screen.getByRole('button', { name: /^Finish workout/ }))

      expect(screen.getByRole('heading', { name: 'Finish workout early?' })).toBeInTheDocument()
      expect(screen.getByText(/You still have 2 exercises unfinished/)).toBeInTheDocument()
    })

    test('queues the workout when the network is unreachable', async () => {
      mocked.getRoutine.mockResolvedValue(routineOf('Push Day', [benchPress]))
      mocked.createWorkout.mockRejectedValue(ConnectError.from(new TypeError('Failed to fetch')))
      const user = userEvent.setup()
      await renderWorkout()

      await logFirstSet(user)
      await user.click(primaryAction())
      await user.click(await screen.findByRole('button', { name: 'Finish workout' }))
      await user.click(screen.getByRole('button', { name: 'Finish and save' }))

      await waitFor(() => expect(useMutationQueueStore.getState().pending).toHaveLength(1))
      expect(useMutationQueueStore.getState().pending[0]?.method).toContain('CreateWorkout')
      expect(useWorkoutStore.getState().workouts[routineID]).toBeUndefined()
      expect(screen.getByText('home')).toBeInTheDocument()
    })

    test('reports a save that came back without an id', async () => {
      mocked.getRoutine.mockResolvedValue(routineOf('Push Day', [benchPress]))
      mocked.createWorkout.mockResolvedValue(create(CreateWorkoutResponseSchema, {}))
      const user = userEvent.setup()
      await renderWorkout()

      await logFirstSet(user)
      await user.click(primaryAction())
      await user.click(await screen.findByRole('button', { name: 'Finish workout' }))
      await user.click(screen.getByRole('button', { name: 'Finish and save' }))

      expect(await screen.findByText(/saved without an ID/)).toBeInTheDocument()
    })

    test('reports a save the request layer swallowed', async () => {
      mocked.getRoutine.mockResolvedValue(routineOf('Push Day', [benchPress]))
      mocked.createWorkout.mockResolvedValue(undefined)
      const user = userEvent.setup()
      await renderWorkout()

      await logFirstSet(user)
      await user.click(primaryAction())
      await user.click(await screen.findByRole('button', { name: 'Finish workout' }))
      await user.click(screen.getByRole('button', { name: 'Finish and save' }))

      expect(await screen.findByText(/could not be saved/)).toBeInTheDocument()
    })

    test('keeps training when the sheet is dismissed', async () => {
      const user = userEvent.setup()
      await renderWorkout()
      await completeBothExercises(user)

      await user.click(screen.getByRole('button', { name: 'Finish workout' }))
      await user.click(screen.getByRole('button', { name: 'Keep training' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(mocked.createWorkout).not.toHaveBeenCalled()
    })

    test('still reports other failures as errors', async () => {
      mocked.getRoutine.mockResolvedValue(routineOf('Push Day', [benchPress]))
      mocked.createWorkout.mockRejectedValue(new Error('boom'))
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const user = userEvent.setup()
      await renderWorkout()

      await logFirstSet(user)
      await user.click(primaryAction())
      await user.click(await screen.findByRole('button', { name: 'Finish workout' }))
      await user.click(screen.getByRole('button', { name: 'Finish and save' }))

      expect(await screen.findByText(/could not be saved/)).toBeInTheDocument()
      expect(useMutationQueueStore.getState().pending).toHaveLength(0)
    })
  })

  describe('quick workout', () => {
    test('invites the first exercise in when there is nothing to log yet', async () => {
      await renderWorkout('/workouts/quick', 'Quick workout')

      expect(screen.getByText('Add your first exercise')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Finish workout/ })).not.toBeInTheDocument()
    })

    test('adds an exercise from the picker, for this workout only', async () => {
      mocked.listExercises.mockResolvedValue(
        create(ListExercisesResponseSchema, { exercises: [benchPress] }),
      )
      const user = userEvent.setup()
      await renderWorkout('/workouts/quick', 'Quick workout')

      await user.click(screen.getByRole('button', { name: /Choose exercise/ }))
      await user.click(await screen.findByRole('button', { name: /Bench Press/ }))

      expect(await screen.findByRole('textbox', { name: 'Bench Press set 1 weight' })).toBeVisible()
      expect(useWorkoutStore.getState().workouts['quick-workout']?.addedExercises).toHaveLength(1)
    })

    test('saves a quick workout under its own name and no routine', async () => {
      useWorkoutStore.setState({
        workouts: {
          'quick-workout': { startedAt: now.toISOString(), addedExercises: [benchPress] },
        },
      })
      mocked.getExercise.mockResolvedValue({
        $typeName: 'api.v1.GetExerciseResponse',
        exercise: benchPress,
      })
      const user = userEvent.setup()
      await renderWorkout('/workouts/quick', 'Quick workout')

      await logFirstSet(user)
      await user.click(primaryAction())
      await user.click(await screen.findByRole('button', { name: 'Finish workout' }))
      await user.click(screen.getByRole('button', { name: 'Finish and save' }))

      await waitFor(() => expect(mocked.createWorkout).toHaveBeenCalledTimes(1))
      const request = mocked.createWorkout.mock.calls[0]?.[0]
      expect(request?.routineId).toBe('')
      expect(request?.workoutName).toBe('Quick workout')
    })

    test('re-reads a saved exercise so a renamed one comes back current', async () => {
      useWorkoutStore.setState({
        workouts: {
          'quick-workout': { startedAt: now.toISOString(), addedExercises: [benchPress] },
        },
      })
      mocked.getExercise.mockResolvedValue({
        $typeName: 'api.v1.GetExerciseResponse',
        exercise: create(ExerciseSchema, { ...benchPress, name: 'Incline Bench' }),
      })

      await renderWorkout('/workouts/quick', 'Quick workout')

      expect(await screen.findByText('Incline Bench')).toBeInTheDocument()
    })
  })

  test('adds an exercise to a routine session, for this workout only', async () => {
    mocked.listExercises.mockResolvedValue(
      create(ListExercisesResponseSchema, { exercises: [benchPress, squat, running] }),
    )
    const user = userEvent.setup()
    await renderWorkout()

    await user.click(screen.getByRole('button', { name: /Add exercise/ }))
    await user.click(await screen.findByRole('button', { name: /Running/ }))

    expect(await screen.findByText('Exercise 1 of 3')).toBeInTheDocument()
    expect(useWorkoutStore.getState().workouts[routineID]?.addedExercises).toHaveLength(1)
  })

  test('sends a missing routine back to the routine list', async () => {
    mocked.getRoutine.mockResolvedValue(undefined)

    renderWithProviders(
      <Routes>
        <Route path="/workouts/routine/:routine_id" element={<StartWorkout />} />
        <Route path="/routines" element={<p>routines</p>} />
      </Routes>,
      { route: `/workouts/routine/${routineID}` },
    )

    expect(await screen.findByText('routines')).toBeInTheDocument()
  })
})
