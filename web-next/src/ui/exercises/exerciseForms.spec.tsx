// @vitest-environment jsdom

import { create } from '@bufbuild/protobuf'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  createExercise: vi.fn(),
  updateExercise: vi.fn(),
  getExercise: vi.fn(),
  listExerciseTags: vi.fn(),
}))

import * as requests from '@/http/requests'
import {
  CreateExerciseResponseSchema,
  GetExerciseResponseSchema,
  UpdateExerciseResponseSchema,
} from '@/proto/api/v1/exercise_service_pb'
import { ExerciseMetric } from '@/proto/api/v1/shared_pb'
import { useAlertStore } from '@/stores/alerts'
import { renderWithProviders } from '@/ui/testing'
import { CreateExercise } from './CreateExercise'
import { UpdateExercise } from './UpdateExercise'

const mocked = {
  createExercise: vi.mocked(requests.createExercise),
  updateExercise: vi.mocked(requests.updateExercise),
  getExercise: vi.mocked(requests.getExercise),
  listExerciseTags: vi.mocked(requests.listExerciseTags),
}

const existing = () =>
  create(GetExerciseResponseSchema, {
    exercise: {
      id: 'exercise-1',
      name: 'Bench press',
      tags: ['Chest'],
      metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
      restSeconds: 90,
    },
  })

const render = (element: React.ReactElement, route = '/exercises/create') =>
  renderWithProviders(
    <Routes>
      <Route path="/exercises" element={<p>list</p>} />
      {/* Literal, not ":id": "/exercises/create" would match a dynamic
          segment and render the detail stub instead of the form. */}
      <Route path="/exercises/exercise-1" element={<p>detail</p>} />
      {/* The edit route is declared with its parameter so the screen can read
          the id it is editing. */}
      <Route path="/exercises/:id/edit" element={element} />
      <Route path="*" element={element} />
    </Routes>,
    { route },
  )

const nameField = () => screen.getByRole('textbox', { name: '' })
const submit = (name: string) => screen.getByRole('button', { name })

beforeEach(() => {
  Object.values(mocked).forEach((mock) => mock.mockReset())
  mocked.listExerciseTags.mockResolvedValue(['Chest', 'Push'])
  mocked.createExercise.mockResolvedValue(create(CreateExerciseResponseSchema, {}))
  mocked.updateExercise.mockResolvedValue(create(UpdateExerciseResponseSchema, {}))
  mocked.getExercise.mockResolvedValue(existing())
  useAlertStore.setState({ alert: null })
})

describe('CreateExercise', () => {
  // Most exercises are lifts, so most of the form is already answered.
  test('starts on weight and reps with a rest set', async () => {
    render(<CreateExercise />)

    await waitFor(() => expect(mocked.listExerciseTags).toHaveBeenCalled())
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'Weight × reps' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('creates the exercise it was given and goes back to the list', async () => {
    render(<CreateExercise />)

    await userEvent.type(nameField(), 'Overhead press')
    await userEvent.click(submit('Save Exercise'))

    await waitFor(() => expect(mocked.createExercise).toHaveBeenCalled())
    expect(mocked.createExercise.mock.calls[0]?.[0]).toMatchObject({
      name: 'Overhead press',
      metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
      restSeconds: 90,
    })
    expect(await screen.findByText('list')).toBeInTheDocument()
    expect(useAlertStore.getState().alert?.type).toBe('success')
  })

  test('sends what was chosen, not what it started with', async () => {
    render(<CreateExercise />)

    await userEvent.type(nameField(), 'Row')
    await userEvent.click(screen.getByRole('button', { name: 'Distance × time' }))
    await userEvent.click(screen.getByRole('switch'))
    await userEvent.type(screen.getByRole('textbox', { name: 'Add exercise tag' }), 'Cardio{Enter}')
    await userEvent.click(submit('Save Exercise'))

    await waitFor(() => expect(mocked.createExercise).toHaveBeenCalled())
    expect(mocked.createExercise.mock.calls[0]?.[0]).toMatchObject({
      name: 'Row',
      metrics: [ExerciseMetric.DISTANCE, ExerciseMetric.TIME],
      restSeconds: 0,
      tags: ['Cardio'],
    })
  })

  test('stays put when the request fails', async () => {
    mocked.createExercise.mockResolvedValue(undefined)
    render(<CreateExercise />)

    await userEvent.type(nameField(), 'Row')
    await userEvent.click(submit('Save Exercise'))

    await waitFor(() => expect(mocked.createExercise).toHaveBeenCalled())
    expect(screen.queryByText('list')).not.toBeInTheDocument()
    expect(useAlertStore.getState().alert).toBeNull()
  })
})

describe('UpdateExercise', () => {
  test('fills the form with the exercise it loaded', async () => {
    render(<UpdateExercise />, '/exercises/exercise-1/edit')

    expect(await screen.findByDisplayValue('Bench press')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Chest' })).toBeInTheDocument()
    expect(mocked.getExercise).toHaveBeenCalledWith('exercise-1')
  })

  test('saves the edit and goes back to the exercise', async () => {
    render(<UpdateExercise />, '/exercises/exercise-1/edit')

    const field = await screen.findByDisplayValue('Bench press')
    await userEvent.clear(field)
    await userEvent.type(field, 'Incline press')
    await userEvent.click(submit('Update exercise'))

    await waitFor(() => expect(mocked.updateExercise).toHaveBeenCalled())
    expect(mocked.updateExercise.mock.calls[0]?.[0]).toMatchObject({
      id: 'exercise-1',
      name: 'Incline press',
    })
    expect(await screen.findByText('detail')).toBeInTheDocument()
  })

  // An empty object literal is truthy, so a blank exercise would render the
  // form with no metrics before the fetch landed.
  test('waits rather than rendering a form it has no exercise for', () => {
    mocked.getExercise.mockReturnValue(new Promise(() => {}))
    render(<UpdateExercise />, '/exercises/exercise-1/edit')

    expect(screen.queryByRole('button', { name: 'Update exercise' })).not.toBeInTheDocument()
  })

  test('offers a way back when the exercise is gone', async () => {
    mocked.getExercise.mockResolvedValue(undefined)
    render(<UpdateExercise />, '/exercises/exercise-1/edit')

    expect(await screen.findByText('Exercise unavailable')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Exercises' })).toHaveAttribute('href', '/exercises')
  })
})
