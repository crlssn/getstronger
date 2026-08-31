// @vitest-environment jsdom

import type { MessageInitShape } from '@bufbuild/protobuf'

import { create } from '@bufbuild/protobuf'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  getRoutine: vi.fn(),
  getPreviousWorkoutSets: vi.fn(),
  deleteRoutine: vi.fn(),
  updateExerciseOrder: vi.fn(),
}))

import * as requests from '@/http/requests'
import { GetPreviousWorkoutSetsResponseSchema } from '@/proto/api/v1/exercise_service_pb'
import {
  DeleteRoutineResponseSchema,
  GetRoutineResponseSchema,
  RoutineGroupSchema,
  UpdateExerciseOrderResponseSchema,
} from '@/proto/api/v1/routine_service_pb'
import { ExerciseMetric, RoutineGroupMode } from '@/proto/api/v1/shared_pb'
import { useToastStore } from '@/stores/toasts'
import { useConfirmationStore } from '@/stores/confirmation'
import { useDashboardStore } from '@/stores/dashboard'
import { usePageTitleStore } from '@/stores/pageTitle'
import { renderWithProviders } from '@/ui/testing'
import { ViewRoutine } from './ViewRoutine'

const mocked = {
  getRoutine: vi.mocked(requests.getRoutine),
  getPreviousWorkoutSets: vi.mocked(requests.getPreviousWorkoutSets),
  deleteRoutine: vi.mocked(requests.deleteRoutine),
  updateExerciseOrder: vi.mocked(requests.updateExerciseOrder),
}

const routine = (): MessageInitShape<typeof GetRoutineResponseSchema>['routine'] => ({
  id: 'push',
  name: 'Push day',
  exercises: [
    { id: 'bench', name: 'Bench press', tags: ['Chest'] },
    { id: 'dips', name: 'Dips', tags: [] },
  ],
})

const render = () =>
  renderWithProviders(
    <Routes>
      <Route path="/routines" element={<p>routines</p>} />
      <Route path="/routines/:id" element={<ViewRoutine />} />
    </Routes>,
    { route: '/routines/push' },
  )

describe('ViewRoutine', () => {
  beforeEach(() => {
    Object.values(mocked).forEach((mock) => mock.mockReset())
    mocked.getRoutine.mockResolvedValue(create(GetRoutineResponseSchema, { routine: routine() }))
    mocked.getPreviousWorkoutSets.mockResolvedValue(
      create(GetPreviousWorkoutSetsResponseSchema, {}),
    )
    mocked.deleteRoutine.mockResolvedValue(create(DeleteRoutineResponseSchema, {}))
    mocked.updateExerciseOrder.mockResolvedValue(create(UpdateExerciseOrderResponseSchema, {}))
    useDashboardStore.setState({ preferredRoutineId: '' })
    useToastStore.getState().dismiss()
    useConfirmationStore.setState({ confirmation: null, resolver: null })
  })

  test('titles the page after the routine', async () => {
    render()

    await waitFor(() => expect(usePageTitleStore.getState().pageTitle).toBe('Push day'))
  })

  test('numbers the exercises in the order they are trained', async () => {
    render()

    const rows = await screen.findAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('1')
    expect(rows[0]).toHaveTextContent('Bench press')
    expect(rows[1]).toHaveTextContent('2')
    expect(rows[1]).toHaveTextContent('Dips')
  })

  // Ten rows of Rows / Rows / Plank with no numbers on them is a list nobody
  // can scan; what the reader is looking for is the load.
  test('carries the last session’s load on the row', async () => {
    mocked.getPreviousWorkoutSets.mockResolvedValue(
      create(GetPreviousWorkoutSetsResponseSchema, {
        exerciseSets: [
          {
            exercise: {
              id: 'bench',
              name: 'Bench press',
              metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
            },
            sets: [
              { id: 's1', weight: 80, reps: 8 },
              { id: 's2', weight: 100, reps: 5 },
            ],
          },
        ],
      }),
    )
    render()

    // The heaviest set of the two, not the last logged.
    expect(await screen.findByText('2 sets · Last: 100 kg × 5')).toBeInTheDocument()
  })

  test('falls back to tags for an exercise never trained', async () => {
    render()

    const rows = await screen.findAllByRole('listitem')
    expect(within(rows[0]).getByText('Chest')).toBeInTheDocument()
  })

  test('offers a way to start it and to edit it', async () => {
    render()

    expect(await screen.findByRole('link', { name: /Start workout/ })).toHaveAttribute(
      'href',
      '/workouts/routine/push',
    )
    expect(screen.getByRole('link', { name: /Edit exercises/ })).toHaveAttribute(
      'href',
      '/routines/push/edit',
    )
  })

  describe('up next', () => {
    test('offers to make it up next when it is not', async () => {
      const selectRoutine = vi
        .spyOn(useDashboardStore.getState(), 'selectRoutine')
        .mockResolvedValue(undefined)
      render()

      await userEvent.click(await screen.findByRole('button', { name: /Set as up next/ }))

      expect(selectRoutine).toHaveBeenCalledWith('push')
      await waitFor(() =>
        expect(useToastStore.getState().toast?.message).toBe('Push day is up next'),
      )
    })

    test('says so instead when it already is', async () => {
      useDashboardStore.setState({ preferredRoutineId: 'push' })
      render()

      expect(await screen.findByText('Up next')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Set as up next/ })).not.toBeInTheDocument()
    })
  })

  describe('deleting', () => {
    test('confirms, then deletes and returns to the list', async () => {
      render()

      await userEvent.click(await screen.findByRole('button', { name: /Delete/ }))
      await waitFor(() => expect(useConfirmationStore.getState().confirmation).not.toBeNull())
      useConfirmationStore.getState().accept()

      await waitFor(() => expect(mocked.deleteRoutine).toHaveBeenCalledWith('push'))
      expect(await screen.findByText('routines')).toBeInTheDocument()
      expect(useToastStore.getState().toast).not.toBeNull()
    })

    test('does nothing when the confirmation is declined', async () => {
      render()

      await userEvent.click(await screen.findByRole('button', { name: /Delete/ }))
      await waitFor(() => expect(useConfirmationStore.getState().confirmation).not.toBeNull())
      useConfirmationStore.getState().dismiss()

      await waitFor(() => expect(useConfirmationStore.getState().confirmation).toBeNull())
      expect(mocked.deleteRoutine).not.toHaveBeenCalled()
    })

    // The reader stays put, so the complaint has to be visible here.
    test('reports a failure without leaving the page', async () => {
      mocked.deleteRoutine.mockResolvedValue(undefined)
      render()

      await userEvent.click(await screen.findByRole('button', { name: /Delete/ }))
      await waitFor(() => expect(useConfirmationStore.getState().confirmation).not.toBeNull())
      useConfirmationStore.getState().accept()

      expect(await screen.findByRole('alert')).toHaveTextContent(/could not|failed|wrong/i)
      expect(useToastStore.getState().toast).toBeNull()
      expect(screen.queryByText('routines')).not.toBeInTheDocument()
    })
  })

  // A grouped routine is read here and rearranged on the edit screen: a drag
  // handle would have nowhere sensible to drop.
  describe('grouped routines', () => {
    beforeEach(() => {
      mocked.getRoutine.mockResolvedValue(
        create(GetRoutineResponseSchema, {
          routine: {
            ...routine(),
            groups: [
              create(RoutineGroupSchema, {
                id: 'a',
                mode: RoutineGroupMode.STRAIGHT,
                exercises: [{ exercise: { id: 'bench' } }],
              }),
              create(RoutineGroupSchema, {
                id: 'b',
                mode: RoutineGroupMode.CIRCUIT,
                restBetweenExercisesSeconds: 15,
                restBetweenRoundsSeconds: 90,
                exercises: [{ exercise: { id: 'dips' } }],
              }),
            ],
          },
        }),
      )
    })

    test('shows each group and how it runs', async () => {
      render()

      expect(await screen.findByText('Group A')).toBeInTheDocument()
      expect(screen.getByText('Straight sets')).toBeInTheDocument()
      expect(screen.getByText('Group B')).toBeInTheDocument()
      expect(screen.getByText('Circuit')).toBeInTheDocument()
      expect(
        screen.getByText('Rest 15s between exercises · Rest 90s between rounds'),
      ).toBeInTheDocument()
    })

    test('sends reordering to the edit screen instead of offering handles', async () => {
      render()

      expect(
        await screen.findByText('Grouped routines are rearranged on the edit screen.'),
      ).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Reorder exercise' })).not.toBeInTheDocument()
    })
  })
})
