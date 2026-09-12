// @vitest-environment jsdom

import type { MessageInitShape } from '@bufbuild/protobuf'
import type { GetRoutineResponse } from '@/proto/api/v1/routine_service_pb'

import { create } from '@bufbuild/protobuf'
import { act, screen, waitFor, within } from '@testing-library/react'
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
  UpdateRoutineResponseSchema,
} from '@/proto/api/v1/routine_service_pb'
import { ExerciseMetric, RoutineGroupMode } from '@/proto/api/v1/shared_pb'
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
      { id: 'row', name: 'Row', tags: ['Back'], metrics: [ExerciseMetric.TIME] },
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

  const openMenu = async (name: string) => {
    const card = (await screen.findByRole('heading', { name, level: 3 })).closest('article')!
    await userEvent.click(within(card).getByRole('button', { name: 'Routine actions' }))
    return card
  }

  test('marks the routine that is up next', async () => {
    useDashboardStore.setState({ preferredRoutineId: 'push' })
    render()

    const card = await openMenu('Push day')

    expect(within(card).getByText('Up next')).toBeInTheDocument()
    // Already up next, so the menu has nothing to offer but editing.
    expect(screen.getByRole('menuitem', { name: 'Edit routine' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Set as up next' })).not.toBeInTheDocument()
  })

  // What is up next is offered the way the home screen offers it: one card,
  // the whole of it the way into the session.
  test('offers the routine that is up next as the home screen does', async () => {
    useDashboardStore.setState({ preferredRoutineId: 'push' })
    render()

    const card = (await screen.findByRole('heading', { name: 'Push day', level: 3 })).closest(
      'article',
    )!
    expect(within(card).getByRole('link', { name: 'Start Push day' })).toHaveAttribute(
      'href',
      '/workouts/routine/push',
    )
    // The two things the card no longer has room for stay under it.
    expect(within(card).getByRole('link', { name: 'View' })).toHaveAttribute(
      'href',
      '/routines/push',
    )
    expect(within(card).getByRole('button', { name: 'Routine actions' })).toBeInTheDocument()
  })

  test('makes a routine up next from its menu', async () => {
    const selectRoutine = vi
      .spyOn(useDashboardStore.getState(), 'selectRoutine')
      .mockResolvedValue(undefined)
    render()

    await openMenu('Push day')
    await userEvent.click(screen.getByRole('menuitem', { name: 'Set as up next' }))

    expect(selectRoutine).toHaveBeenCalledWith('push')
  })

  // The hand-rolled <details> it replaced had neither, so a menu opened by a
  // mis-tap could only be closed by tapping the same three dots again.
  test('closes its menu on Escape', async () => {
    render()

    await openMenu('Push day')
    expect(screen.getByRole('menuitem', { name: 'Edit routine' })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')

    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: 'Edit routine' })).not.toBeInTheDocument(),
    )
  })

  // The rest of the page is aria-hidden while the menu is open, so the tap that
  // dismisses it is aimed at the document rather than at a row.
  test('closes its menu when something else is tapped', async () => {
    render()

    await openMenu('Push day')
    await userEvent.click(document.body)

    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: 'Edit routine' })).not.toBeInTheDocument(),
    )
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

  test('says the fetch failed rather than that there are no routines', async () => {
    mocked.listRoutines.mockResolvedValue(undefined)
    render()

    const failure = await screen.findByRole('alert')
    expect(failure).toHaveTextContent('Something went wrong')
    expect(screen.queryByText('No routines yet')).not.toBeInTheDocument()

    mocked.listRoutines.mockResolvedValue(routinesPage([push, pull]))
    await userEvent.click(within(failure).getByRole('button'))

    expect(await screen.findByRole('heading', { name: 'Push day', level: 3 })).toBeInTheDocument()
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

  // A new routine opens on the starting shapes. Each is a list of blocks, and
  // nothing afterwards remembers which one was picked.
  const startFrom = async (shape: RegExp) => {
    const sheet = await screen.findByRole('dialog')
    await userEvent.click(within(sheet).getByRole('button', { name: shape }))
  }

  // Exercises are picked into the block that trains them, through the same
  // sheet the session uses, and counted the way the sheet is set to.
  const addExercise = async (name: RegExp, blockIndex = 0, tracking?: RegExp) => {
    const buttons = await screen.findAllByRole('button', { name: 'Add exercise' })
    await userEvent.click(buttons[blockIndex])

    const sheet = screen.getByRole('dialog')
    if (tracking) await userEvent.click(within(sheet).getByRole('button', { name: tracking }))
    await userEvent.click(within(sheet).getByRole('button', { name }))
  }

  const openBlock = (title: string) =>
    userEvent.click(screen.getByRole('button', { name: `Block settings: ${title}` }))

  const openExercise = (name: string) =>
    userEvent.click(screen.getByRole('button', { name: `Exercise settings: ${name}` }))

  // A routine with no name or no exercises is not a routine yet.
  test('will not save until it has a name and an exercise', async () => {
    render()
    await startFrom(/^Blank/)

    const save = screen.getByRole('button', { name: 'Create routine' })
    expect(save).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Routine name'), 'Upper body')
    expect(save).toBeDisabled()

    await addExercise(/Bench press/)
    expect(save).toBeEnabled()
  })

  // A save that refuses and says nothing leaves the reader to guess which of
  // the form's two requirements is the one holding it shut.
  test('names what the save is still waiting for', async () => {
    render()
    await startFrom(/^Blank/)

    const save = screen.getByRole('button', { name: 'Create routine' })
    expect(screen.getByText('Add a name and one exercise')).toBeVisible()

    await userEvent.type(screen.getByLabelText('Routine name'), 'Upper body')
    expect(screen.getByText('Add one exercise')).toBeVisible()

    await addExercise(/Bench press/)
    expect(screen.queryByText('Add one exercise')).not.toBeInTheDocument()
    expect(save).not.toHaveAttribute('aria-describedby')
  })

  test('saves the name and the exercises that were picked', async () => {
    render()
    await startFrom(/^Blank/)

    await userEvent.type(screen.getByLabelText('Routine name'), '  Upper body  ')
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
    expect(useToastStore.getState().toast).not.toBeNull()
  })

  // Closing the sheet without choosing leaves the blank block the form opened
  // on, so the choice is never one the screen waits for.
  test('starts blank when the starting shapes are dismissed', async () => {
    render()

    const sheet = await screen.findByRole('dialog')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }))

    expect(screen.getByText('Block A')).toBeInTheDocument()
    expect(screen.getByText('No exercises here yet.')).toBeInTheDocument()
  })

  test('adds what is picked, and takes it away again', async () => {
    render()
    await startFrom(/^Blank/)

    expect(screen.getByText('No exercises here yet.')).toBeInTheDocument()

    await addExercise(/Bench press/)
    expect(screen.getByText('Bench press')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove Bench press' }))
    expect(screen.getByText('No exercises here yet.')).toBeInTheDocument()
  })

  // Reordering is a drag rather than a column of arrows, so the row carries one
  // handle and the order it produces is tested against reorderEntry.
  test('offers a handle to drag an exercise into place', async () => {
    render()
    await startFrom(/^Blank/)

    await addExercise(/Bench press/)
    await addExercise(/^Row/)

    expect(screen.getByRole('button', { name: 'Reorder Bench press' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reorder Row' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move Row up' })).not.toBeInTheDocument()
  })

  // Everything a block is set up with is behind the one chip beside its name,
  // so the list of exercises stays a list of exercises.
  test('names a block and turns it into a circuit from its settings', async () => {
    render()
    await startFrom(/^Blank/)

    await userEvent.type(screen.getByLabelText('Routine name'), 'Full body')
    await addExercise(/Bench press/)
    await addExercise(/^Row/)

    await openBlock('Block A')
    await userEvent.type(screen.getByLabelText('Block name'), 'Main set')
    await userEvent.click(screen.getByRole('button', { name: 'Circuit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    // The name and the round count are what the header says about the block.
    expect(screen.getByText('Main set')).toBeInTheDocument()
    expect(screen.getByText('One set of each, 3 times through')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Create routine' }))

    await waitFor(() =>
      expect(mocked.createRoutine).toHaveBeenCalledWith(
        'Full body',
        ['bench', 'row'],
        [
          expect.objectContaining({
            title: 'Main set',
            mode: 'circuit',
            rounds: 3,
            restBetweenRoundsSeconds: 90,
          }),
        ],
      ),
    )
  })

  test('sets the rest a circuit takes between exercises and between rounds', async () => {
    render()
    await startFrom(/^Circuit/)

    await userEvent.type(screen.getByLabelText('Routine name'), 'Full body')
    await addExercise(/Bench press/)
    await addExercise(/^Row/)

    await openBlock('Block A')
    await userEvent.click(
      screen.getByRole('button', { name: 'Add 30 seconds to Rest after each exercise' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Add 30 seconds to Rest after each round' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create routine' }))

    await waitFor(() =>
      expect(mocked.createRoutine).toHaveBeenCalledWith(
        'Full body',
        ['bench', 'row'],
        [
          expect.objectContaining({
            restBetweenExercisesSeconds: 30,
            restBetweenRoundsSeconds: 120,
          }),
        ],
      ),
    )
  })

  test('picks into the block the button belongs to', async () => {
    render()
    await startFrom(/^Blank/)

    await userEvent.type(screen.getByLabelText('Routine name'), 'Full body')
    await addExercise(/Bench press/)
    await userEvent.click(screen.getByRole('button', { name: 'Add block' }))
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
  test('lets the same exercise be picked into two blocks', async () => {
    render()
    await startFrom(/^Blank/)

    await userEvent.type(screen.getByLabelText('Routine name'), 'Full body')
    await addExercise(/Bench press/)
    await userEvent.click(screen.getByRole('button', { name: 'Add block' }))
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
  test('does not offer an exercise the block already trains', async () => {
    render()
    await startFrom(/^Blank/)

    await addExercise(/Bench press/)
    await userEvent.click(screen.getAllByRole('button', { name: 'Add exercise' })[0])

    const sheet = screen.getByRole('dialog')
    expect(within(sheet).queryByRole('button', { name: /Bench press/ })).not.toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: /^Row/ })).toBeInTheDocument()
  })

  test('folds a removed block back into the one before it', async () => {
    render()
    await startFrom(/^Blank/)

    await userEvent.type(screen.getByLabelText('Routine name'), 'Full body')
    await addExercise(/Bench press/)
    await userEvent.click(screen.getByRole('button', { name: 'Add block' }))
    await addExercise(/^Row/, 1)

    await openBlock('Block B')
    await userEvent.click(screen.getByRole('button', { name: 'Remove block' }))

    await userEvent.click(screen.getByRole('button', { name: 'Create routine' }))

    await waitFor(() =>
      expect(mocked.createRoutine).toHaveBeenCalledWith(
        'Full body',
        ['bench', 'row'],
        [expect.objectContaining({ mode: 'straight' })],
      ),
    )
  })

  // The last block is the routine, so there is nothing to remove it down to.
  test('does not offer to remove the only block', async () => {
    render()
    await startFrom(/^Blank/)

    await addExercise(/Bench press/)
    await openBlock('Block A')

    expect(screen.queryByRole('button', { name: 'Remove block' })).not.toBeInTheDocument()
  })

  // Rest between sets used to be the exercise library's only, so the same lift
  // rested the same length in every routine that trained it.
  test('gives an exercise a rest of its own in this routine', async () => {
    render()
    await startFrom(/^Blank/)

    await userEvent.type(screen.getByLabelText('Routine name'), 'Heavy day')
    await addExercise(/Bench press/)

    // A length read off a clock, not a second count — and a real value from the
    // moment it is picked rather than a placeholder for one written down
    // somewhere else.
    expect(
      screen.getByRole('button', { name: 'Exercise settings: Bench press' }),
    ).toHaveTextContent('1:30 rest')

    await openExercise('Bench press')
    const stepper = screen.getByRole('button', { name: 'Add 30 seconds to Rest between sets' })
    await userEvent.click(stepper)
    await userEvent.click(stepper)
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create routine' }))

    await waitFor(() =>
      expect(mocked.createRoutine).toHaveBeenCalledWith(
        'Heavy day',
        ['bench'],
        [
          expect.objectContaining({
            entries: [expect.objectContaining({ exerciseId: 'bench', restSeconds: 150 })],
          }),
        ],
      ),
    )
  })

  test('prescribes how many sets an exercise is counted in', async () => {
    render()
    await startFrom(/^Blank/)

    await userEvent.type(screen.getByLabelText('Routine name'), 'Heavy day')
    await addExercise(/Bench press/)

    await openExercise('Bench press')
    await userEvent.click(screen.getByRole('button', { name: 'Add a set to Sets' }))
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(
      screen.getByRole('button', { name: 'Exercise settings: Bench press' }),
    ).toHaveTextContent('4 sets')

    await userEvent.click(screen.getByRole('button', { name: 'Create routine' }))

    await waitFor(() =>
      expect(mocked.createRoutine).toHaveBeenCalledWith(
        'Heavy day',
        ['bench'],
        [expect.objectContaining({ entries: [expect.objectContaining({ sets: 4 })] })],
      ),
    )
  })

  // Counted in sets, held against a clock, or covered however long it takes:
  // one of the three, and only that one is saved.
  test('prescribes a distance, and saves nothing it is not tracked by', async () => {
    render()
    await startFrom(/^Blank/)

    await userEvent.type(screen.getByLabelText('Routine name'), 'Easy miles')
    await addExercise(/^Row/, 0, /^Distance$/)

    expect(screen.getByRole('button', { name: 'Exercise settings: Row' })).toHaveTextContent('1 km')

    await openExercise('Row')
    await userEvent.click(screen.getByRole('button', { name: 'Longer distance' }))
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create routine' }))

    await waitFor(() => expect(mocked.createRoutine).toHaveBeenCalled())
    const [, , groups] = mocked.createRoutine.mock.calls[0]
    expect(groups?.[0]?.entries[0]).toMatchObject({
      tracking: 'distance',
      targetDistanceMeters: 1500,
      targetDurationSeconds: 0,
      sets: 0,
    })
  })

  // A circuit rotates through stations held against the clock, so that is what
  // an exercise added to one is unless the sheet is told otherwise.
  test('adds an exercise to a circuit as timed', async () => {
    render()
    await startFrom(/^Circuit/)

    await userEvent.type(screen.getByLabelText('Routine name'), 'Full body')
    await addExercise(/Bench press/)

    expect(
      screen.getByRole('button', { name: 'Exercise settings: Bench press' }),
    ).toHaveTextContent('Timed')
  })

  // The walk-run of the ticket, built as one routine: a warm-up, a block of run
  // and walk repeated, and a cool-down after it.
  describe('intervals', () => {
    const buildWalkRun = async () => {
      await startFrom(/^Intervals/)
      await userEvent.type(screen.getByLabelText('Routine name'), 'Walk-run')
      await addExercise(/^Row/, 0, /^Timed$/)
      await addExercise(/Bench press/, 1)
      await addExercise(/^Row/, 1)
    }

    test('is a warm-up, a repeating block and a cool-down', async () => {
      render()
      await startFrom(/^Intervals/)

      expect(screen.getByText('Warm-up')).toBeInTheDocument()
      expect(screen.getByText('Repeat')).toBeInTheDocument()
      expect(screen.getByText('Cool-down')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Add exercise' })).toHaveLength(3)
    })

    // The editor never shows a role, but a live session reads one to number its
    // intervals and to end the repeating block an exercise early.
    test('saves the whole session as one routine, roles and all', async () => {
      render()
      await buildWalkRun()

      await userEvent.click(screen.getByRole('button', { name: 'Create routine' }))

      await waitFor(() =>
        expect(mocked.createRoutine).toHaveBeenCalledWith(
          'Walk-run',
          ['row', 'bench', 'row'],
          [
            expect.objectContaining({ title: 'Warm-up', role: 'warmup', mode: 'straight' }),
            expect.objectContaining({
              title: 'Repeat',
              role: 'repeat',
              mode: 'circuit',
              rounds: 3,
              skipLastOnFinalRound: true,
            }),
          ],
        ),
      )
    })

    test('counts the rounds and the intervals as the stepper moves', async () => {
      render()
      await buildWalkRun()

      // A warm-up and three rounds of two, less the exercise the last one drops.
      expect(screen.getByText('6 intervals')).toBeInTheDocument()

      await openBlock('Repeat')
      await userEvent.click(screen.getByRole('button', { name: 'Add a round to Rounds' }))
      await userEvent.click(screen.getByRole('button', { name: 'Done' }))

      expect(screen.getByText('8 intervals')).toBeInTheDocument()
      expect(screen.getByText('One set of each, 4 times through')).toBeInTheDocument()
    })

    test('runs every round in full once the skip is turned off', async () => {
      render()
      await buildWalkRun()

      await openBlock('Repeat')
      await userEvent.click(
        screen.getByRole('switch', { name: 'Skip last exercise on final round' }),
      )
      expect(screen.getByText('Every round runs in full')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Done' }))

      expect(screen.getByText('7 intervals')).toBeInTheDocument()
    })

    // An empty part is not part of the routine: a walk-run with no cool-down
    // saves two blocks, not three.
    test('drops the parts left holding nothing', async () => {
      render()
      await buildWalkRun()

      await userEvent.click(screen.getByRole('button', { name: 'Create routine' }))

      await waitFor(() => expect(mocked.createRoutine).toHaveBeenCalled())
      expect(mocked.createRoutine.mock.calls[0][2]).toHaveLength(2)
    })
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

    await userEvent.click(screen.getByRole('button', { name: 'Remove Dips' }))
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

  // A routine that did not load is not an empty routine. Handing the builder
  // nothing offered to save the routine as whatever was typed over it.
  test('offers a retry rather than an empty builder when the routine does not load', async () => {
    mocked.getRoutine.mockResolvedValueOnce(undefined)
    render()

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByDisplayValue('Push day')).toBeInTheDocument()
  })

  // An existing routine has the blocks it was built with, so it is never asked
  // what to start from.
  test('opens on the blocks the routine was saved with', async () => {
    mocked.getRoutine.mockResolvedValue(
      create(GetRoutineResponseSchema, {
        routine: {
          ...push,
          groups: [
            {
              title: 'Warm-up',
              mode: RoutineGroupMode.STRAIGHT,
              exercises: [{ exercise: { id: 'bench' } }],
            },
            {
              mode: RoutineGroupMode.CIRCUIT,
              rounds: 4,
              exercises: [{ exercise: { id: 'dips' } }],
            },
          ],
        },
      }),
    )

    render()

    expect(await screen.findByText('Warm-up')).toBeInTheDocument()
    // The second block was left unnamed, so it reads by its position.
    expect(screen.getByText('Block B')).toBeInTheDocument()
    expect(screen.getByText('One set of each, 4 times through')).toBeInTheDocument()
    expect(screen.queryByText('Start from')).not.toBeInTheDocument()
  })

  // Effects run twice under StrictMode, so two loads are in flight at once and
  // the first one started is the one already superseded.
  test('ignores a superseded load answering over the form', async () => {
    const answers: ((response: GetRoutineResponse | undefined) => void)[] = []
    mocked.getRoutine.mockImplementation(() => new Promise((resolve) => answers.push(resolve)))

    renderWithProviders(
      <Routes>
        <Route path="/routines/:id/edit" element={<EditRoutine />} />
      </Routes>,
      { route: '/routines/push/edit', reactStrictMode: true },
    )

    await waitFor(() => expect(answers).toHaveLength(2))

    // The second load is the live one: the first was cut loose by the cleanup.
    await act(async () => {
      answers[1](create(GetRoutineResponseSchema, { routine: push }))
    })

    const field = await screen.findByDisplayValue('Push day')
    await userEvent.clear(field)
    await userEvent.type(field, 'Upper body')

    // The superseded load answers late, and empty. Acting on it swapped the
    // filled-in form for the error state, losing what had been typed.
    await act(async () => {
      answers[0](undefined)
    })

    expect(screen.getByDisplayValue('Upper body')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
