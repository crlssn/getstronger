// @vitest-environment jsdom

import type { MessageInitShape } from '@bufbuild/protobuf'

import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  getWorkout: vi.fn(),
  updateWorkout: vi.fn(),
  listWorkouts: vi.fn(),
}))

import * as requests from '@/http/requests'
import { GetDashboardResponseSchema, PlanSchema } from '@/proto/api/v1/routine_service_pb'
import { ExerciseMetric } from '@/proto/api/v1/shared_pb'
import {
  GetWorkoutResponseSchema,
  ListWorkoutsResponseSchema,
  UpdateWorkoutResponseSchema,
  WorkoutSchema,
} from '@/proto/api/v1/workout_service_pb'
import { usePageNavActionStore } from '@/stores/pageNavAction'
import { useToastStore } from '@/stores/toasts'
import { useAuthStore } from '@/stores/auth'
import { useConfirmationStore } from '@/stores/confirmation'
import { useDashboardStore } from '@/stores/dashboard'
import { usePlanStore } from '@/stores/plans'
import { lowerKeyboard, raiseKeyboard, renderWithProviders } from '@/ui/testing'
import { EditWorkout } from './EditWorkout'
import { ViewWorkout } from './ViewWorkout'
import { WorkoutView } from './WorkoutView'

const mocked = {
  getWorkout: vi.mocked(requests.getWorkout),
  updateWorkout: vi.mocked(requests.updateWorkout),
  listWorkouts: vi.mocked(requests.listWorkouts),
}

const me = 'user-me'

// Spelled out rather than spread: `create` also accepts a built Workout, and a
// spread of a partial init matches that overload instead.
type WorkoutInit = MessageInitShape<typeof WorkoutSchema>

const workout = ({
  intensity,
  exerciseSets,
}: Pick<WorkoutInit, 'intensity' | 'exerciseSets'> = {}) =>
  create(WorkoutSchema, {
    id: 'workout-1',
    name: 'Push day',
    user: { id: me, username: 'alex', name: 'Alex Morgan' },
    startedAt: timestampFromDate(new Date('2026-08-14T10:00:00Z')),
    finishedAt: timestampFromDate(new Date('2026-08-14T11:00:00Z')),
    intensity,
    exerciseSets,
  })

const withSets = () =>
  workout({
    exerciseSets: [
      {
        exercise: {
          id: 'bench',
          name: 'Bench press',
          metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
        },
        sets: [{ id: 'set-1', weight: 100, reps: 5 }],
      },
      {
        exercise: { id: 'row', name: 'Row', metrics: [ExerciseMetric.REPS] },
        sets: [{ id: 'set-2', reps: 8 }],
      },
    ],
  })

beforeEach(() => {
  Object.values(mocked).forEach((mock) => mock.mockReset())
  mocked.getWorkout.mockResolvedValue(create(GetWorkoutResponseSchema, { workout: workout() }))
  mocked.updateWorkout.mockResolvedValue(create(UpdateWorkoutResponseSchema, {}))
  mocked.listWorkouts.mockResolvedValue(create(ListWorkoutsResponseSchema, {}))
  vi.spyOn(useDashboardStore.getState(), 'load').mockResolvedValue(undefined)
  vi.spyOn(usePlanStore.getState(), 'load').mockResolvedValue(undefined)
  useAuthStore.setState({ userId: me })
  useDashboardStore.setState({ dashboard: undefined, loading: false, failed: false })
  useToastStore.getState().dismiss()
  useConfirmationStore.setState({ confirmation: null, resolver: null })
})

describe('ViewWorkout', () => {
  const render = () =>
    renderWithProviders(
      <Routes>
        <Route path="/workouts/:id" element={<ViewWorkout />} />
      </Routes>,
      { route: '/workouts/workout-1' },
    )

  test('shows the workout in full', async () => {
    mocked.getWorkout.mockResolvedValue(create(GetWorkoutResponseSchema, { workout: withSets() }))
    render()

    expect(await screen.findByRole('button', { name: /Bench press/ })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: /Bench press/ })).toBeInTheDocument()
  })

  test('offers a way back when the workout is gone', async () => {
    mocked.getWorkout.mockResolvedValue(undefined)
    render()

    expect(await screen.findByText('Workout unavailable')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View workouts' })).toHaveAttribute('href', '/workout')
  })
})

describe('EditWorkout', () => {
  const render = () =>
    renderWithProviders(
      <Routes>
        <Route path="/home" element={<p>home</p>} />
        <Route path="/workouts/:id" element={<p>workout</p>} />
        <Route path="/workouts/:id/edit" element={<EditWorkout />} />
      </Routes>,
      { route: '/workouts/workout-1/edit' },
    )

  beforeEach(() => {
    lowerKeyboard()
    mocked.getWorkout.mockResolvedValue(create(GetWorkoutResponseSchema, { workout: withSets() }))
  })

  // Cancel portals into the nav bar's action slot — the same spot
  // Notifications keeps Mark all read — which only a mounted bar publishes.
  test('offers the way back in the nav bar rather than beside the update', async () => {
    const slot = document.createElement('div')
    document.body.append(slot)
    usePageNavActionStore.setState({ container: slot })

    render()

    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeVisible()
    expect(slot.contains(screen.getByRole('link', { name: 'Cancel' }))).toBe(true)

    usePageNavActionStore.setState({ container: null })
    slot.remove()
  })

  // The same pinned footer as every other create and edit screen, and the only
  // thing in the app that stands down while the keyboard is up.
  test('pins its update above the tab bar', async () => {
    raiseKeyboard()
    render()

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument(),
    )
  })

  // The form is only mounted with the workout in hand, so a fetch that failed
  // left the screen pulsating with nothing to press.
  test('offers a retry when the workout does not load', async () => {
    mocked.getWorkout.mockResolvedValue(undefined)
    render()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')

    mocked.getWorkout.mockResolvedValue(create(GetWorkoutResponseSchema, { workout: withSets() }))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByDisplayValue('100')).toBeInTheDocument()
  })

  // Refused here as well as by the API, so the form is never shown for one.
  test('will not edit someone else’s workout', async () => {
    useAuthStore.setState({ userId: 'someone-else' })
    render()

    // The refusal renders in place rather than toasting over a redirect.
    expect(
      await screen.findByText('You do not have permission to edit this workout'),
    ).toBeInTheDocument()
    expect(useToastStore.getState().toast).toBeNull()
  })

  test('opens with every set filled in', async () => {
    render()

    expect(await screen.findByDisplayValue('100')).toBeInTheDocument()
    expect(screen.getByDisplayValue('5')).toBeInTheDocument()
    expect(screen.getByDisplayValue('8')).toBeInTheDocument()
  })

  test('saves the edited sets', async () => {
    render()

    const weight = await screen.findByDisplayValue('100')
    await userEvent.clear(weight)
    await userEvent.type(weight, '110')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mocked.updateWorkout).toHaveBeenCalled())
    const saved = mocked.updateWorkout.mock.calls[0]?.[0]
    expect(saved?.exerciseSets[0]?.sets[0]?.weight).toBe(110)
    expect(await screen.findByText('workout')).toBeInTheDocument()
  })

  // Counted by their remove controls: the editor renders the runner's table
  // now, where the row is a row rather than a block under a "SET 1" heading.
  test('adds and removes sets', async () => {
    render()

    await userEvent.click((await screen.findAllByRole('button', { name: 'Add set' }))[0])
    expect(screen.getAllByRole('button', { name: /^Remove set/ })).toHaveLength(3)

    await userEvent.click(screen.getAllByRole('button', { name: 'Remove set 2' })[0])
    expect(screen.getAllByRole('button', { name: /^Remove set/ })).toHaveLength(2)
  })

  // A half-filled set is not a real one, and an exercise with nothing left in
  // it goes with them.
  test('drops a set that was never finished', async () => {
    render()

    await userEvent.click((await screen.findAllByRole('button', { name: 'Add set' }))[0])
    // Every field names its own row now, where the stacked block called each
    // one of them "Weight" and left a screen reader to count.
    await userEvent.type(screen.getByRole('textbox', { name: 'Bench press set 2 weight' }), '90')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mocked.updateWorkout).toHaveBeenCalled())
    expect(mocked.updateWorkout.mock.calls[0]?.[0]?.exerciseSets[0]?.sets).toHaveLength(1)
  })

  // Logging a set is the app's most-used interaction, so correcting one is the
  // same table: the columns the runner logs into, with the previous session's
  // column carrying the way to take a set out instead.
  test('corrects a workout in the table the session was logged in', async () => {
    render()

    await screen.findByText('Bench press')
    expect(screen.getAllByText('Set').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Weight').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Reps').length).toBeGreaterThan(0)
    // There is no previous session to point at when correcting one.
    expect(screen.queryByText('Previous')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Remove set/ })[0]).toBeVisible()
  })

  // One handle per exercise, dragged or moved with the arrow keys — the same
  // control the routine builder and the plan builder use. It was a pair of
  // chevrons here, which was a third way of saying "this can move".
  test('reorders the exercises', async () => {
    render()

    ;(await screen.findByRole('button', { name: 'Reorder Row' })).focus()
    await userEvent.keyboard('{ArrowUp}')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mocked.updateWorkout).toHaveBeenCalled())
    expect(
      mocked.updateWorkout.mock.calls[0]?.[0]?.exerciseSets.map((set) => set.exercise?.id),
    ).toEqual(['row', 'bench'])
  })

  test('will not move the first exercise up or the last one down', async () => {
    render()

    ;(await screen.findByRole('button', { name: 'Reorder Bench press' })).focus()
    await userEvent.keyboard('{ArrowUp}')
    screen.getByRole('button', { name: 'Reorder Row' }).focus()
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mocked.updateWorkout).toHaveBeenCalled())
    expect(
      mocked.updateWorkout.mock.calls[0]?.[0]?.exerciseSets.map((set) => set.exercise?.id),
    ).toEqual(['bench', 'row'])
  })
})

describe('WorkoutView', () => {
  const render = () => renderWithProviders(<WorkoutView />, { route: '/workout' })

  const history = (workouts: ReturnType<typeof workout>[]) =>
    mocked.listWorkouts.mockResolvedValue(create(ListWorkoutsResponseSchema, { workouts }))

  test('always offers a quick workout', async () => {
    render()

    expect(await screen.findByRole('link', { name: /Quick workout/ })).toHaveAttribute(
      'href',
      '/workouts/quick',
    )
  })

  test('leads with the next routine when there is one', async () => {
    useDashboardStore.setState({
      dashboard: create(GetDashboardResponseSchema, {
        nextRoutine: { id: 'push', name: 'Push day', exercises: [{ id: 'bench' }] },
      }),
    })
    render()

    expect(await screen.findByRole('heading', { name: 'Push day' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Start routine/ })).toHaveAttribute(
      'href',
      '/workouts/routine/push',
    )
  })

  test('carries the plan through to the workout it starts', async () => {
    useDashboardStore.setState({
      dashboard: create(GetDashboardResponseSchema, {
        nextRoutine: { id: 'push', name: 'Push day', exercises: [{ id: 'bench' }] },
        activePlan: { id: 'plan-1', name: 'PPL', routines: [{ id: 'push' }, { id: 'pull' }] },
      }),
    })
    render()

    expect(await screen.findByRole('link', { name: /Start routine/ })).toHaveAttribute(
      'href',
      '/workouts/routine/push?plan_id=plan-1',
    )
  })

  // Skipping moves a plan on, so it is only offered when a plan is running.
  test('offers to skip only under a plan', async () => {
    useDashboardStore.setState({
      dashboard: create(GetDashboardResponseSchema, {
        nextRoutine: { id: 'push', name: 'Push day', exercises: [{ id: 'bench' }] },
      }),
    })
    const { unmount } = render()

    await screen.findByRole('heading', { name: 'Push day' })
    expect(screen.queryByRole('button', { name: /Skip/ })).not.toBeInTheDocument()
    unmount()

    const skip = vi
      .spyOn(usePlanStore.getState(), 'skip')
      .mockResolvedValue(create(PlanSchema, { id: 'plan-1' }))
    useDashboardStore.setState({
      dashboard: create(GetDashboardResponseSchema, {
        nextRoutine: { id: 'push', name: 'Push day', exercises: [{ id: 'bench' }] },
        activePlan: { id: 'plan-1', name: 'PPL', routines: [{ id: 'push' }] },
      }),
    })
    render()

    await userEvent.click(await screen.findByRole('button', { name: /Skip/ }))
    await waitFor(() => expect(useConfirmationStore.getState().confirmation).not.toBeNull())
    useConfirmationStore.getState().accept()

    await waitFor(() => expect(skip).toHaveBeenCalledWith('plan-1'))
  })

  test('sends the reader to plans when nothing is queued', async () => {
    useDashboardStore.setState({ dashboard: create(GetDashboardResponseSchema, {}) })
    render()

    expect(await screen.findByText('No workout selected')).toBeInTheDocument()
  })

  // "No workout selected" is a claim about the account, and a dashboard that
  // has not arrived yet cannot back it: the home tab waits, so this one does.
  test('waits for the dashboard before saying nothing is queued', async () => {
    useDashboardStore.setState({ dashboard: undefined, loading: true })
    render()

    await screen.findByRole('link', { name: /Quick workout/ })
    expect(screen.queryByText('No workout selected')).not.toBeInTheDocument()
  })

  // Someone with a routine queued opened this tab offline and was told to go
  // and choose one.
  test('says the dashboard failed rather than that nothing is queued', async () => {
    const load = vi.spyOn(useDashboardStore.getState(), 'load').mockResolvedValue(undefined)
    useDashboardStore.setState({ dashboard: undefined, failed: true })
    render()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong')
    expect(screen.queryByText('No workout selected')).not.toBeInTheDocument()

    load.mockClear()
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))

    expect(load).toHaveBeenCalled()
  })

  test('lists previous workouts with their headline stats', async () => {
    history([workout({ intensity: 4200 })])
    render()

    const row = await screen.findByRole('link', { name: /Push day/ })
    expect(row).toHaveAttribute('href', '/workouts/workout-1')
    expect(row).toHaveTextContent('4,200 kg')
    // Duration was "60 min" on nearly every row; it lives on the detail view.
    expect(row).not.toHaveTextContent('min')
  })

  test('says so when there is no history yet', async () => {
    render()

    expect(await screen.findByText('Your completed workouts will appear here.')).toBeInTheDocument()
  })

  test('offers a retry when the history could not be loaded', async () => {
    mocked.listWorkouts.mockResolvedValueOnce(undefined)
    render()

    expect(await screen.findByRole('alert')).toBeInTheDocument()

    history([workout()])
    await userEvent.click(within(screen.getByRole('alert')).getByRole('button'))

    expect(await screen.findByRole('link', { name: /Push day/ })).toBeInTheDocument()
  })
})
