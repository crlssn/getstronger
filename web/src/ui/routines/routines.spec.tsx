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

  // A routine with no name or no exercises is not a routine yet.
  test('will not save until it has a name and an exercise', async () => {
    render()

    const save = await screen.findByRole('button', { name: 'Create routine' })
    expect(save).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Routine name'), 'Upper body')
    expect(save).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /Bench press/ }))
    expect(save).toBeEnabled()
  })

  test('saves the name and the exercises that were picked', async () => {
    render()

    await userEvent.type(await screen.findByLabelText('Routine name'), '  Upper body  ')
    await userEvent.click(screen.getByRole('button', { name: /Bench press/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Row/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Create routine' }))

    // Trimmed, so a stray space does not become part of the name.
    await waitFor(() =>
      expect(mocked.createRoutine).toHaveBeenCalledWith('Upper body', ['bench', 'row']),
    )
    expect(useToastStore.getState().toast?.type).toBe('success')
  })

  test('counts what has been picked', async () => {
    render()

    expect(await screen.findByText('0 selected')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Bench press/ }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Bench press/ }))
    expect(screen.getByText('0 selected')).toBeInTheDocument()
  })

  test('filters the exercises on offer', async () => {
    render()

    await userEvent.type(await screen.findByRole('searchbox'), 'bench')

    expect(screen.getByRole('button', { name: /Bench press/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Row/ })).not.toBeInTheDocument()
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
    // Awaited: the routine and the exercise list are two fetches, and the
    // exercises are the later of them.
    expect(await screen.findByRole('button', { name: /Bench press/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /^Row/ })).toHaveAttribute('aria-pressed', 'false')
  })

  test('saves the changes', async () => {
    render()

    const field = await screen.findByDisplayValue('Push day')
    await userEvent.clear(field)
    await userEvent.type(field, 'Upper body')
    await userEvent.click(await screen.findByRole('button', { name: /^Row/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(mocked.updateRoutine).toHaveBeenCalledWith('push', 'Upper body', [
        'bench',
        'dips',
        'row',
      ]),
    )
  })
})
