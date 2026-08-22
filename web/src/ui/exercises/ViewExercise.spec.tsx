// @vitest-environment jsdom

import type { MessageInitShape } from '@bufbuild/protobuf'

import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  getExercise: vi.fn(),
  listSets: vi.fn(),
  deleteExercise: vi.fn(),
}))

vi.mock('react-chartjs-2', () => ({ Line: () => <div role="img" aria-label="trend" /> }))

import * as requests from '@/http/requests'
import {
  DeleteExerciseResponseSchema,
  GetExerciseResponseSchema,
  ListSetsResponseSchema,
} from '@/proto/api/v1/exercise_service_pb'
import { ExerciseMetric, SetSchema } from '@/proto/api/v1/shared_pb'
import { useToastStore } from '@/stores/toasts'
import { useAuthStore } from '@/stores/auth'
import { useConfirmationStore } from '@/stores/confirmation'
import { usePageNavActionStore } from '@/stores/pageNavAction'
import { usePageTitleStore } from '@/stores/pageTitle'
import { quickWorkoutRoutineID, useWorkoutStore } from '@/stores/workout'
import { renderWithProviders } from '@/ui/testing'
import { ViewExercise } from './ViewExercise'

const mocked = {
  getExercise: vi.mocked(requests.getExercise),
  listSets: vi.mocked(requests.listSets),
  deleteExercise: vi.mocked(requests.deleteExercise),
}

const ownerId = 'user-owner'

const exercise = () =>
  create(GetExerciseResponseSchema, {
    exercise: {
      id: 'bench',
      userId: ownerId,
      name: 'Bench press',
      tags: ['Chest'],
      metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
    },
  })

// Spelled out rather than spread: `create` also accepts a built Set, and a
// spread of a partial init matches that overload instead.
const set = (
  id: string,
  createdAt: string,
  fields: { weight?: number; reps?: number; personalBest?: boolean } = {},
) =>
  create(SetSchema, {
    id,
    weight: fields.weight,
    reps: fields.reps,
    metadata: {
      createdAt: timestampFromDate(new Date(createdAt)),
      workoutId: 'workout-1',
      personalBest: fields.personalBest,
    },
  })

const setsPage = (
  sets: MessageInitShape<typeof ListSetsResponseSchema>['sets'],
  nextPageToken = new Uint8Array(0),
) => create(ListSetsResponseSchema, { sets, pagination: { nextPageToken } })

const render = () =>
  renderWithProviders(
    <Routes>
      <Route path="/exercises" element={<p>library</p>} />
      <Route path="/workouts/quick" element={<p>quick workout</p>} />
      <Route path="/exercises/:id" element={<ViewExercise />} />
    </Routes>,
    { route: '/exercises/bench' },
  )

describe('ViewExercise', () => {
  beforeEach(() => {
    Object.values(mocked).forEach((mock) => mock.mockReset())
    mocked.getExercise.mockResolvedValue(exercise())
    mocked.listSets.mockResolvedValue(setsPage([]))
    mocked.deleteExercise.mockResolvedValue(create(DeleteExerciseResponseSchema, {}))
    useAuthStore.setState({ userId: ownerId })
    useToastStore.getState().dismiss()
    useConfirmationStore.setState({ confirmation: null, resolver: null })
    useWorkoutStore.setState({ workouts: {} })

    const slot = document.createElement('div')
    document.body.append(slot)
    usePageNavActionStore.setState({ container: slot })
  })

  test('titles the page after the exercise', async () => {
    render()

    await waitFor(() => expect(usePageTitleStore.getState().pageTitle).toBe('Bench press'))
    expect(screen.getByText('Chest')).toBeInTheDocument()
  })

  test('lists every logged set, linked to the workout it came from', async () => {
    mocked.listSets.mockResolvedValue(
      setsPage([set('set-1', '2026-08-14T08:00:00Z', { weight: 100, reps: 5 })]),
    )
    render()

    const row = await screen.findByRole('link', { name: /100 kg/ })
    expect(row).toHaveAttribute('href', '/workouts/workout-1')
  })

  test('flags a set that was a personal best', async () => {
    mocked.listSets.mockResolvedValue(
      setsPage([
        set('set-1', '2026-08-14T08:00:00Z', { weight: 100, reps: 5, personalBest: true }),
      ]),
    )
    render()

    // The pill sits inside the set's row, beside the set it belongs to.
    const row = await screen.findByRole('link', { name: /100 kg/ })
    expect(row).toHaveTextContent('PR')
  })

  test('says so when nothing has been logged yet', async () => {
    render()

    expect(
      await screen.findByText('Log this exercise in a workout to start its history.'),
    ).toBeInTheDocument()
  })

  test('offers a way back when the exercise is gone', async () => {
    mocked.getExercise.mockResolvedValue(undefined)
    render()

    expect(await screen.findByText('Exercise unavailable')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View exercises' })).toHaveAttribute(
      'href',
      '/exercises',
    )
  })

  describe('ownership', () => {
    test('offers the owner a menu and a quick workout', async () => {
      render()

      expect(await screen.findByRole('button', { name: 'Exercise actions' })).toBeInTheDocument()
      expect(screen.getByText('Start quick workout')).toBeInTheDocument()
    })

    test('offers a visitor neither', async () => {
      useAuthStore.setState({ userId: 'someone-else' })
      render()

      await screen.findByText('Logged sets')
      expect(screen.queryByRole('button', { name: 'Exercise actions' })).not.toBeInTheDocument()
      expect(screen.queryByText('Start quick workout')).not.toBeInTheDocument()
    })
  })

  describe('starting a quick workout', () => {
    test('starts one straight away when nothing is running', async () => {
      render()

      await userEvent.click(await screen.findByText('Start quick workout'))

      expect(await screen.findByText('quick workout')).toBeInTheDocument()
      expect(
        useWorkoutStore.getState().workouts[quickWorkoutRoutineID]?.exerciseSets,
      ).toHaveProperty('bench')
    })

    // An unfinished session is never discarded without being named first.
    test('asks before replacing a workout that is already running', async () => {
      useWorkoutStore.setState({
        workouts: {
          'routine-1': {
            startedAt: '2026-08-14T11:00:00Z',
            exerciseSets: { squat: [{ weight: 100, reps: 5 }] },
          },
        },
      })
      render()

      await userEvent.click(await screen.findByText('Start quick workout'))

      await waitFor(() => expect(useConfirmationStore.getState().confirmation).not.toBeNull())
      useConfirmationStore.getState().accept()

      await waitFor(() => expect(useWorkoutStore.getState().workouts['routine-1']).toBeUndefined())
      expect(await screen.findByText('quick workout')).toBeInTheDocument()
    })

    test('leaves the running workout alone when the swap is declined', async () => {
      useWorkoutStore.setState({
        workouts: {
          'routine-1': {
            startedAt: '2026-08-14T11:00:00Z',
            exerciseSets: { squat: [{ weight: 100, reps: 5 }] },
          },
        },
      })
      render()

      await userEvent.click(await screen.findByText('Start quick workout'))
      await waitFor(() => expect(useConfirmationStore.getState().confirmation).not.toBeNull())
      useConfirmationStore.getState().dismiss()

      await waitFor(() => expect(useConfirmationStore.getState().confirmation).toBeNull())
      expect(useWorkoutStore.getState().workouts['routine-1']).toBeDefined()
      expect(screen.queryByText('quick workout')).not.toBeInTheDocument()
    })
  })

  describe('deleting', () => {
    const openDeleteSheet = async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Exercise actions' }))
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete exercise' }))
    }

    test('confirms in a sheet before deleting', async () => {
      render()
      await openDeleteSheet()

      expect(await screen.findByText('Delete “Bench press”?')).toBeInTheDocument()
      expect(mocked.deleteExercise).not.toHaveBeenCalled()
    })

    test('deletes and returns to the library', async () => {
      render()
      await openDeleteSheet()

      await userEvent.click(await screen.findByRole('button', { name: /Delete exercise/ }))

      await waitFor(() => expect(mocked.deleteExercise).toHaveBeenCalledWith('bench'))
      expect(await screen.findByText('library')).toBeInTheDocument()
      expect(useToastStore.getState().toast).toMatchObject({ type: 'success' })
    })

    // A failed deletion leaves the reader where they are, so the complaint is
    // all that changes.
    test('reports a failure without leaving the page', async () => {
      mocked.deleteExercise.mockResolvedValue(undefined)
      render()
      await openDeleteSheet()

      await userEvent.click(await screen.findByRole('button', { name: /Delete exercise/ }))

      await waitFor(() => expect(useToastStore.getState().toast).toMatchObject({ type: 'error' }))
      expect(screen.queryByText('library')).not.toBeInTheDocument()
    })

    test('backs out of the sheet', async () => {
      render()
      await openDeleteSheet()

      await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

      await waitFor(() =>
        expect(screen.queryByText('Delete “Bench press”?')).not.toBeInTheDocument(),
      )
      expect(mocked.deleteExercise).not.toHaveBeenCalled()
    })
  })

  test('loads another page of sets on request', async () => {
    const second = new Uint8Array([1])
    mocked.listSets
      .mockResolvedValueOnce(
        setsPage([set('set-1', '2026-08-14T08:00:00Z', { weight: 100, reps: 5 })], second),
      )
      .mockResolvedValue(setsPage([set('set-2', '2026-08-13T08:00:00Z', { weight: 90, reps: 8 })]))
    render()

    await userEvent.click(await screen.findByRole('button', { name: 'Load more sets' }))

    await waitFor(() => expect(mocked.listSets).toHaveBeenLastCalledWith([], ['bench'], second))
    expect(await screen.findByRole('link', { name: /90 kg/ })).toBeInTheDocument()
  })
})
