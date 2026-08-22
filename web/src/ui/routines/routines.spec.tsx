// @vitest-environment jsdom

import type { MessageInitShape } from '@bufbuild/protobuf'

import { create } from '@bufbuild/protobuf'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateTime } from 'luxon'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  listRoutines: vi.fn(),
  createRoutine: vi.fn(),
  updateRoutine: vi.fn(),
  getRoutine: vi.fn(),
  listExercises: vi.fn(),
}))

import * as requests from '@/http/requests'
import { ListExercisesResponseSchema } from '@/proto/api/v1/exercise_service_pb'
import {
  CreateRoutineResponseSchema,
  GetRoutineResponseSchema,
  ListRoutinesResponseSchema,
  RoutineGroupMode,
  UpdateRoutineResponseSchema,
} from '@/proto/api/v1/routine_service_pb'
import { useActivityStore } from '@/stores/activity'
import { useToastStore } from '@/stores/toasts'
import { useDashboardStore } from '@/stores/dashboard'
import { renderWithProviders } from '@/ui/testing'
import { CreateRoutine } from './CreateRoutine'
import { EditRoutine } from './EditRoutine'
import { ListRoutines } from './ListRoutines'

const mocked = {
  listRoutines: vi.mocked(requests.listRoutines),
  createRoutine: vi.mocked(requests.createRoutine),
  updateRoutine: vi.mocked(requests.updateRoutine),
  getRoutine: vi.mocked(requests.getRoutine),
  listExercises: vi.mocked(requests.listExercises),
}

type RoutineInit = NonNullable<
  MessageInitShape<typeof ListRoutinesResponseSchema>['routines']
>[number]

const push: RoutineInit = {
  id: 'push',
  name: 'Push day',
  exercises: [
    { id: 'bench', name: 'Bench press', tags: ['Chest'] },
    { id: 'dips', name: 'Dips', tags: [] },
  ],
}
const pull: RoutineInit = {
  id: 'pull',
  name: 'Pull day',
  exercises: [{ id: 'row', name: 'Row', tags: [] }],
}

const routinesPage = (routines: RoutineInit[], nextPageToken = new Uint8Array(0)) =>
  create(ListRoutinesResponseSchema, { routines, pagination: { nextPageToken } })

const exercisesPage = () =>
  create(ListExercisesResponseSchema, {
    exercises: [
      { id: 'bench', name: 'Bench press', tags: ['Chest'] },
      { id: 'row', name: 'Row', tags: ['Back'] },
    ],
  })

const daysAgo = (days: number) => DateTime.now().minus({ days }).toISO() ?? ''

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-08-14T12:00:00Z'))
  Object.values(mocked).forEach((mock) => mock.mockReset())
  mocked.listRoutines.mockResolvedValue(routinesPage([push, pull]))
  mocked.listExercises.mockResolvedValue(exercisesPage())
  mocked.createRoutine.mockResolvedValue(create(CreateRoutineResponseSchema, {}))
  mocked.updateRoutine.mockResolvedValue(create(UpdateRoutineResponseSchema, {}))
  mocked.getRoutine.mockResolvedValue(create(GetRoutineResponseSchema, { routine: push }))
  vi.spyOn(useDashboardStore.getState(), 'load').mockResolvedValue(undefined)
  vi.spyOn(useActivityStore.getState(), 'load').mockResolvedValue(undefined)
  useDashboardStore.setState({ preferredRoutineId: '' })
  useActivityStore.setState({ routineLastPerformed: {}, loaded: true, failed: false })
  useToastStore.getState().dismiss()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ListRoutines', () => {
  const render = () => renderWithProviders(<ListRoutines />, { route: '/routines' })

  test('lists each routine with the ways to use it', async () => {
    render()

    const card = (await screen.findByRole('heading', { name: 'Push day', level: 3 })).closest(
      'article',
    )!
    expect(within(card).getByRole('link', { name: /Start/ })).toHaveAttribute(
      'href',
      '/workouts/routine/push',
    )
    expect(within(card).getByRole('link', { name: 'View' })).toHaveAttribute(
      'href',
      '/routines/push',
    )
  })

  test('summarises what is in a routine', async () => {
    render()

    const card = (await screen.findByRole('heading', { name: 'Pull day', level: 3 })).closest(
      'article',
    )!
    expect(card).toHaveTextContent('1 exercise')
    expect(card).toHaveTextContent('About 30 min')
  })

  // Tags say what the session works; the exercise names are the fallback when
  // nothing in it is tagged.
  test('falls back to exercise names when nothing is tagged', async () => {
    render()

    const pullCard = (await screen.findByRole('heading', { name: 'Pull day', level: 3 })).closest(
      'article',
    )!
    expect(pullCard).toHaveTextContent('Row')

    const pushCard = screen.getByRole('heading', { name: 'Push day', level: 3 }).closest('article')!
    expect(pushCard).toHaveTextContent('Chest')
  })

  test('marks the routine that is up next', async () => {
    useDashboardStore.setState({ preferredRoutineId: 'push' })
    render()

    const card = (await screen.findByRole('heading', { name: 'Push day', level: 3 })).closest(
      'article',
    )!
    expect(within(card).getByText('Up next')).toBeInTheDocument()
    // Already up next, so the menu has nothing to offer but editing.
    expect(within(card).queryByRole('button', { name: 'Make up next' })).not.toBeInTheDocument()
  })

  test('makes a routine up next from its menu', async () => {
    const selectRoutine = vi
      .spyOn(useDashboardStore.getState(), 'selectRoutine')
      .mockResolvedValue(undefined)
    render()

    const card = (await screen.findByRole('heading', { name: 'Push day', level: 3 })).closest(
      'article',
    )!
    await userEvent.click(within(card).getByRole('button', { name: 'Make up next' }))

    expect(selectRoutine).toHaveBeenCalledWith('push')
  })

  // A routine unused for a month joins the untried ones: both are things to
  // pick up again.
  test('groups by how recently each was trained', async () => {
    useActivityStore.setState({
      routineLastPerformed: { push: daysAgo(0), pull: daysAgo(90) },
    })
    render()

    await screen.findByRole('heading', { name: 'Push day', level: 3 })
    const today = screen.getByRole('heading', { name: 'Today', level: 2 }).parentElement!
    const revisit = screen.getByRole('heading', { name: 'Try or revisit', level: 2 }).parentElement!

    expect(within(today).getByRole('heading', { name: 'Push day' })).toBeInTheDocument()
    expect(within(revisit).getByRole('heading', { name: 'Pull day' })).toBeInTheDocument()
  })

  test('filters by name', async () => {
    render()

    await screen.findByRole('heading', { name: 'Push day', level: 3 })
    await userEvent.type(screen.getByRole('searchbox'), 'pull')

    expect(screen.getByRole('heading', { name: 'Pull day', level: 3 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Push day', level: 3 })).not.toBeInTheDocument()
  })

  test('asks for a first routine when there are none', async () => {
    mocked.listRoutines.mockResolvedValue(routinesPage([]))
    render()

    expect(await screen.findByText('No routines yet')).toBeInTheDocument()
  })

  test('loads another page on request', async () => {
    const second = new Uint8Array([1])
    mocked.listRoutines
      .mockResolvedValueOnce(routinesPage([push], second))
      .mockResolvedValue(routinesPage([pull]))
    render()

    await userEvent.click(await screen.findByRole('button', { name: 'Load more routines' }))

    await waitFor(() => expect(mocked.listRoutines).toHaveBeenLastCalledWith(second))
    expect(await screen.findByRole('heading', { name: 'Pull day', level: 3 })).toBeInTheDocument()
  })
})

describe('CreateRoutine', () => {
  const render = () => renderWithProviders(<CreateRoutine />, { route: '/routines/create' })

  // Exercises are picked into the block that trains them, through the same
  // sheet the session uses.
  const addExercise = async (name: RegExp, groupIndex = 0) => {
    const buttons = await screen.findAllByRole('button', { name: 'Add exercise' })
    await userEvent.click(buttons[groupIndex]!)

    const sheet = screen.getByRole('dialog')
    await userEvent.click(within(sheet).getByRole('button', { name }))
  }

  // A routine with no name or no exercises is not a routine yet.
  test('will not save until it has a name and an exercise', async () => {
    render()

    const save = await screen.findByRole('button', { name: 'Create routine' })
    expect(save).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Routine name'), 'Upper body')
    expect(save).toBeDisabled()

    await addExercise(/Bench press/)
    expect(save).toBeEnabled()
  })

  test('saves the name and the exercises that were picked', async () => {
    render()

    await userEvent.type(await screen.findByLabelText('Routine name'), '  Upper body  ')
    await addExercise(/Bench press/)
    await addExercise(/^Row/)
    await userEvent.click(screen.getByRole('button', { name: 'Create routine' }))

    // Trimmed, so a stray space does not become part of the name.
    await waitFor(() =>
      expect(mocked.createRoutine).toHaveBeenCalledWith(
        'Upper body',
        ['bench', 'row'],
        [expect.objectContaining({ mode: 'straight' })],
      ),
    )
    expect(useToastStore.getState().toast?.type).toBe('success')
  })

  test('adds what is picked, and takes it away again', async () => {
    render()

    await screen.findByLabelText('Routine name')
    expect(screen.getByText('No exercises here yet.')).toBeInTheDocument()

    await addExercise(/Bench press/)
    expect(screen.getByRole('button', { name: 'Actions for Bench press' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Bench press' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove Bench press' }))
    expect(screen.getByText('No exercises here yet.')).toBeInTheDocument()
  })

  test('reorders an exercise inside its block', async () => {
    render()

    await userEvent.type(await screen.findByLabelText('Routine name'), 'Upper body')
    await addExercise(/Bench press/)
    await addExercise(/^Row/)
    await userEvent.click(screen.getByRole('button', { name: 'Move Row up' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create routine' }))

    await waitFor(() =>
      expect(mocked.createRoutine).toHaveBeenCalledWith(
        'Upper body',
        ['row', 'bench'],
        expect.anything(),
      ),
    )
  })

  // The grouping controls are the advanced half of the screen: a routine that
  // is one plain block never has to meet them.
  test('saves a circuit when the exercises are put in groups', async () => {
    render()

    await userEvent.type(await screen.findByLabelText('Routine name'), 'Full body')
    await addExercise(/Bench press/)
    await addExercise(/^Row/)

    await userEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    await userEvent.click(screen.getByRole('button', { name: 'Circuit' }))

    await userEvent.click(screen.getByRole('button', { name: 'Create routine' }))

    await waitFor(() =>
      expect(mocked.createRoutine).toHaveBeenCalledWith(
        'Full body',
        ['bench', 'row'],
        [
          expect.objectContaining({
            mode: 'circuit',
            restBetweenRoundsSeconds: 90,
            entries: [
              expect.objectContaining({ exerciseId: 'bench' }),
              expect.objectContaining({ exerciseId: 'row' }),
            ],
          }),
        ],
      ),
    )
  })

  test('sets the rest a circuit takes between exercises and between rounds', async () => {
    render()

    await userEvent.type(await screen.findByLabelText('Routine name'), 'Full body')
    await addExercise(/Bench press/)
    await userEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    await userEvent.click(screen.getByRole('button', { name: 'Circuit' }))

    const betweenExercises = screen.getByLabelText('Rest after each exercise')
    await userEvent.clear(betweenExercises)
    await userEvent.type(betweenExercises, '20')

    const betweenRounds = screen.getByLabelText('Rest after each round')
    await userEvent.clear(betweenRounds)
    await userEvent.type(betweenRounds, '120')

    await userEvent.click(screen.getByRole('button', { name: 'Create routine' }))

    await waitFor(() =>
      expect(mocked.createRoutine).toHaveBeenCalledWith(
        'Full body',
        ['bench'],
        [
          expect.objectContaining({
            restBetweenExercisesSeconds: 20,
            restBetweenRoundsSeconds: 120,
          }),
        ],
      ),
    )
  })

  test('picks into the group the button belongs to', async () => {
    render()

    await userEvent.type(await screen.findByLabelText('Routine name'), 'Full body')
    await addExercise(/Bench press/)
    await userEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    await userEvent.click(screen.getByRole('button', { name: 'New group' }))
    await addExercise(/^Row/, 1)

    await userEvent.click(screen.getByRole('button', { name: 'Create routine' }))

    await waitFor(() =>
      expect(mocked.createRoutine).toHaveBeenCalledWith(
        'Full body',
        ['bench', 'row'],
        [
          expect.objectContaining({ entries: [expect.objectContaining({ exerciseId: 'bench' })] }),
          expect.objectContaining({ entries: [expect.objectContaining({ exerciseId: 'row' })] }),
        ],
      ),
    )
  })

  // A bench press in the warm-up and a bench press in the circuit are two
  // different pieces of work.
  test('lets the same exercise be picked into two groups', async () => {
    render()

    await userEvent.type(await screen.findByLabelText('Routine name'), 'Full body')
    await addExercise(/Bench press/)
    await userEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    await userEvent.click(screen.getByRole('button', { name: 'New group' }))
    await addExercise(/Bench press/, 1)

    await userEvent.click(screen.getByRole('button', { name: 'Create routine' }))

    await waitFor(() =>
      expect(mocked.createRoutine).toHaveBeenCalledWith(
        'Full body',
        ['bench', 'bench'],
        expect.anything(),
      ),
    )
  })

  // The sheet stops offering what the block already trains, so the same
  // exercise cannot land in it twice.
  test('does not offer an exercise the group already trains', async () => {
    render()

    await addExercise(/Bench press/)
    await userEvent.click(screen.getAllByRole('button', { name: 'Add exercise' })[0]!)

    const sheet = screen.getByRole('dialog')
    expect(within(sheet).queryByRole('button', { name: /Bench press/ })).not.toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: /^Row/ })).toBeInTheDocument()
  })

  test('moves an exercise into a second group', async () => {
    render()

    await userEvent.type(await screen.findByLabelText('Routine name'), 'Full body')
    await addExercise(/Bench press/)
    await addExercise(/^Row/)

    await userEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    await userEvent.click(screen.getByRole('button', { name: 'New group' }))
    // Moving between groups is a menu: on a phone a select this wide leaves the
    // exercise name a couple of characters.
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Row' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move to group B' }))

    await userEvent.click(screen.getByRole('button', { name: 'Create routine' }))

    await waitFor(() =>
      expect(mocked.createRoutine).toHaveBeenCalledWith(
        'Full body',
        ['bench', 'row'],
        [
          expect.objectContaining({ mode: 'straight' }),
          expect.objectContaining({ mode: 'circuit' }),
        ],
      ),
    )
  })

  test('folds a removed group back into the one before it', async () => {
    render()

    await userEvent.type(await screen.findByLabelText('Routine name'), 'Full body')
    await addExercise(/Bench press/)

    await userEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    await userEvent.click(screen.getByRole('button', { name: 'New group' }))
    await addExercise(/^Row/, 1)
    await userEvent.click(screen.getByRole('button', { name: 'Remove group B' }))

    await userEvent.click(screen.getByRole('button', { name: 'Create routine' }))

    await waitFor(() =>
      expect(mocked.createRoutine).toHaveBeenCalledWith(
        'Full body',
        ['bench', 'row'],
        [expect.objectContaining({ mode: 'straight' })],
      ),
    )
  })

  test('drops the structure again when grouping is turned back off', async () => {
    render()

    await userEvent.type(await screen.findByLabelText('Routine name'), 'Full body')
    await addExercise(/Bench press/)

    await userEvent.click(screen.getByRole('button', { name: 'Advanced' }))
    await userEvent.click(screen.getByRole('button', { name: 'Circuit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Standard' }))

    expect(screen.queryByRole('group', { name: 'How group A runs' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Create routine' }))

    await waitFor(() =>
      expect(mocked.createRoutine).toHaveBeenCalledWith(
        'Full body',
        ['bench'],
        [expect.objectContaining({ mode: 'straight', restBetweenRoundsSeconds: 0 })],
      ),
    )
  })
})

describe('EditRoutine', () => {
  // Declared with its parameter so the screen can read the id it is editing.
  const render = () =>
    renderWithProviders(
      <Routes>
        <Route path="/routines/:id/edit" element={<EditRoutine />} />
      </Routes>,
      { route: '/routines/push/edit' },
    )

  test('opens with the routine already filled in', async () => {
    render()

    expect(await screen.findByDisplayValue('Push day')).toBeInTheDocument()
    // The exercises the routine holds, named — the form reads their names from
    // the routine rather than fetching the library.
    expect(screen.getByText('Bench press')).toBeInTheDocument()
    expect(screen.getByText('Dips')).toBeInTheDocument()
  })

  test('saves the changes', async () => {
    render()

    const field = await screen.findByDisplayValue('Push day')
    await userEvent.clear(field)
    await userEvent.type(field, 'Upper body')

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Dips' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove Dips' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(mocked.updateRoutine).toHaveBeenCalledWith(
        'push',
        'Upper body',
        ['bench'],
        [
          expect.objectContaining({
            mode: 'straight',
            entries: [expect.objectContaining({ exerciseId: 'bench' })],
          }),
        ],
      ),
    )
  })

  test('opens on the grouping controls when the routine is already grouped', async () => {
    mocked.getRoutine.mockResolvedValue(
      create(GetRoutineResponseSchema, {
        routine: {
          ...push,
          groups: [
            { mode: RoutineGroupMode.STRAIGHT, exercises: [{ id: 'bench' }] },
            { mode: RoutineGroupMode.CIRCUIT, exercises: [{ id: 'dips' }] },
          ],
        },
      }),
    )

    render()

    expect(await screen.findByRole('button', { name: 'Advanced' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('group', { name: 'How group B runs' })).toBeInTheDocument()
  })
})
