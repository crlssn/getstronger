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
  listSets: vi.fn(),
}))

import * as requests from '@/http/requests'
import {
  CreateExerciseResponseSchema,
  GetExerciseResponseSchema,
  ListSetsResponseSchema,
  UpdateExerciseResponseSchema,
} from '@/proto/api/v1/exercise_service_pb'
import { ExerciseMetric } from '@/proto/api/v1/shared_pb'
import { useToastStore } from '@/stores/toasts'
import { lowerKeyboard, raiseKeyboard, renderWithProviders } from '@/ui/testing'
import { CreateExercise } from './CreateExercise'
import { UpdateExercise } from './UpdateExercise'

const mocked = {
  createExercise: vi.mocked(requests.createExercise),
  updateExercise: vi.mocked(requests.updateExercise),
  getExercise: vi.mocked(requests.getExercise),
  listExerciseTags: vi.mocked(requests.listExerciseTags),
  listSets: vi.mocked(requests.listSets),
}

const existing = () =>
  create(GetExerciseResponseSchema, {
    exercise: {
      id: 'exercise-1',
      name: 'Bench press',
      tags: ['Chest'],
      metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
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

const nameField = () => screen.getByRole('textbox', { name: 'Name' })
const submit = (name: string) => screen.getByRole('button', { name })

beforeEach(() => {
  lowerKeyboard()
  Object.values(mocked).forEach((mock) => mock.mockReset())
  mocked.listExerciseTags.mockResolvedValue(['Chest', 'Push'])
  mocked.createExercise.mockResolvedValue(create(CreateExerciseResponseSchema, {}))
  mocked.updateExercise.mockResolvedValue(create(UpdateExerciseResponseSchema, {}))
  mocked.getExercise.mockResolvedValue(existing())
  mocked.listSets.mockResolvedValue(create(ListSetsResponseSchema, { sets: [] }))
  useToastStore.getState().dismiss()
})

describe('CreateExercise', () => {
  // Most exercises are lifts, so most of the form is already answered.
  test('starts on weight and reps', async () => {
    render(<CreateExercise />)

    await waitFor(() => expect(mocked.listExerciseTags).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Weight' })).toHaveAttribute('aria-pressed', 'true')
  })

  // How long an exercise rests belongs to the routine that trains it, so the
  // library form has nothing to say about it.
  test('does not ask how long the exercise rests', async () => {
    render(<CreateExercise />)

    await waitFor(() => expect(mocked.listExerciseTags).toHaveBeenCalled())
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByText('Rest timer')).not.toBeInTheDocument()
  })

  // Parked at the end of the scroll the submit was sliced in half by the tab
  // bar. The pinned footer is the only thing in the app that stands down for
  // the keyboard, so its absence while one is up says the submit is in one.
  test('pins its submit above the tab bar', async () => {
    raiseKeyboard()
    render(<CreateExercise />)

    await waitFor(() => expect(mocked.listExerciseTags).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Create exercise' })).not.toBeInTheDocument(),
    )
  })

  test('creates the exercise it was given and goes back to the list', async () => {
    render(<CreateExercise />)

    await userEvent.type(nameField(), 'Overhead press')
    await userEvent.click(submit('Create exercise'))

    await waitFor(() => expect(mocked.createExercise).toHaveBeenCalled())
    expect(mocked.createExercise.mock.calls[0]?.[0]).toMatchObject({
      name: 'Overhead press',
      metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
    })
    expect(await screen.findByText('list')).toBeInTheDocument()
    expect(useToastStore.getState().toast).not.toBeNull()
  })

  test('sends what was chosen, not what it started with', async () => {
    render(<CreateExercise />)

    await userEvent.type(nameField(), 'Row')
    await userEvent.click(screen.getByRole('button', { name: 'Distance' }))
    // Tags start collapsed behind the optional action.
    await userEvent.click(screen.getByRole('button', { name: /Add tags/ }))
    await userEvent.type(
      screen.getByRole('combobox', { name: 'Add exercise tag' }),
      'Cardio{Enter}',
    )
    await userEvent.click(submit('Create exercise'))

    await waitFor(() => expect(mocked.createExercise).toHaveBeenCalled())
    expect(mocked.createExercise.mock.calls[0]?.[0]).toMatchObject({
      name: 'Row',
      metrics: [ExerciseMetric.DISTANCE, ExerciseMetric.TIME],
      tags: ['Cardio'],
    })
  })

  test('fills the form from a library entry and leaves every field editable', async () => {
    render(<CreateExercise />)

    await userEvent.type(nameField(), 'romanian dead')
    await userEvent.click(await screen.findByRole('button', { name: /Barbell Romanian deadlift/ }))

    expect(nameField()).toHaveValue('Barbell Romanian deadlift')
    expect(screen.getByRole('button', { name: 'Remove hamstrings' })).toBeInTheDocument()

    // Renamed after picking: the entry filled the form, it did not settle it.
    await userEvent.clear(nameField())
    await userEvent.type(nameField(), 'RDL')
    await userEvent.click(submit('Create exercise'))

    await waitFor(() => expect(mocked.createExercise).toHaveBeenCalled())
    expect(mocked.createExercise.mock.calls[0]?.[0]).toMatchObject({
      name: 'RDL',
      metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
      tags: ['glutes', 'hinge', 'hamstrings', 'lower-back', 'compound'],
    })
  })

  // The library is a shortcut, never a gate: a movement nobody has written
  // down is still typed in and saved.
  test('creates an exercise the library has never heard of', async () => {
    render(<CreateExercise />)

    await userEvent.type(nameField(), 'Tuesday finisher')
    expect(screen.queryByRole('heading', { name: 'From the library' })).not.toBeInTheDocument()

    await userEvent.click(submit('Create exercise'))
    await waitFor(() => expect(mocked.createExercise).toHaveBeenCalled())
    expect(mocked.createExercise.mock.calls[0]?.[0]).toMatchObject({ name: 'Tuesday finisher' })
  })

  test('stays put when the request fails', async () => {
    mocked.createExercise.mockResolvedValue(undefined)
    render(<CreateExercise />)

    await userEvent.type(nameField(), 'Row')
    await userEvent.click(submit('Create exercise'))

    await waitFor(() => expect(mocked.createExercise).toHaveBeenCalled())
    expect(screen.queryByText('list')).not.toBeInTheDocument()
    expect(useToastStore.getState().toast).toBeNull()
  })
})

describe('UpdateExercise', () => {
  test('fills the form with the exercise it loaded', async () => {
    render(<UpdateExercise />, '/exercises/exercise-1/edit')

    expect(await screen.findByDisplayValue('Bench press')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Chest' })).toBeInTheDocument()
    expect(mocked.getExercise).toHaveBeenCalledWith('exercise-1')
  })

  // Renaming an exercise that already has history is not the same act as
  // creating one, and a suggestion under the field invites replacing it.
  test('does not offer library entries', async () => {
    render(<UpdateExercise />, '/exercises/exercise-1/edit')

    const field = await screen.findByDisplayValue('Bench press')
    await userEvent.clear(field)
    await userEvent.type(field, 'romanian dead')
    expect(screen.queryByRole('heading', { name: 'From the library' })).not.toBeInTheDocument()
  })

  test('saves the edit and goes back to the exercise', async () => {
    render(<UpdateExercise />, '/exercises/exercise-1/edit')

    const field = await screen.findByDisplayValue('Bench press')
    await userEvent.clear(field)
    await userEvent.type(field, 'Incline press')
    await userEvent.click(submit('Save changes'))

    await waitFor(() => expect(mocked.updateExercise).toHaveBeenCalled())
    expect(mocked.updateExercise.mock.calls[0]?.[0]).toMatchObject({
      id: 'exercise-1',
      name: 'Incline press',
    })
    expect(await screen.findByText('detail')).toBeInTheDocument()
  })

  // Changing what a logged exercise measures would restate its history in units
  // it was never recorded in, so the backend refuses it and the form never
  // offers it.
  test('reads the measurements back when the exercise has been logged', async () => {
    mocked.listSets.mockResolvedValue(
      create(ListSetsResponseSchema, { sets: [{ id: 'set-1', weight: 100, reps: 5 }] }),
    )
    render(<UpdateExercise />, '/exercises/exercise-1/edit')

    expect(await screen.findByRole('list', { name: 'How do you track it?' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'How do you track it?' })).not.toBeInTheDocument()
    expect(mocked.listSets).toHaveBeenCalledWith([], ['exercise-1'], expect.anything(), 1)
  })

  test('keeps the measurements editable while nothing has been logged', async () => {
    render(<UpdateExercise />, '/exercises/exercise-1/edit')

    expect(await screen.findByRole('group', { name: 'How do you track it?' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'How do you track it?' })).not.toBeInTheDocument()
  })

  // An empty object literal is truthy, so a blank exercise would render the
  // form with no metrics before the fetch landed.
  test('waits rather than rendering a form it has no exercise for', () => {
    mocked.getExercise.mockReturnValue(new Promise(() => {}))
    render(<UpdateExercise />, '/exercises/exercise-1/edit')

    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })

  test('offers a way back when the exercise is gone', async () => {
    mocked.getExercise.mockResolvedValue(undefined)
    render(<UpdateExercise />, '/exercises/exercise-1/edit')

    expect(await screen.findByText('Exercise unavailable')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Exercises' })).toHaveAttribute('href', '/exercises')
  })
})
