// @vitest-environment jsdom

import { create } from '@bufbuild/protobuf'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  listExercises: vi.fn(),
}))

import * as requests from '@/http/requests'
import {
  CreateExerciseRequestSchema,
  ExerciseService,
  ListExercisesResponseSchema,
} from '@/proto/api/v1/exercise_service_pb'
import { ExerciseSchema } from '@/proto/api/v1/shared_pb'
import { useMutationQueueStore } from '@/stores/mutationQueue'
import { renderWithProviders } from '@/ui/testing'
import { ExercisePickerSheet } from './ExercisePickerSheet'

const listExercises = vi.mocked(requests.listExercises)

const exercise = (id: string, name: string, tags: string[] = []) =>
  create(ExerciseSchema, { id, name, tags })

const bench = exercise('bench', 'Bench Press', ['chest'])
const squat = exercise('squat', 'Squat', ['legs'])

const page = (exercises = [bench, squat], nextPageToken?: Uint8Array) =>
  create(ListExercisesResponseSchema, {
    exercises,
    pagination: nextPageToken ? { nextPageToken } : undefined,
  })

const renderPicker = async (excluded: string[] = []) => {
  const onAdd = vi.fn()
  const onClose = vi.fn()

  renderWithProviders(<ExercisePickerSheet excluded={excluded} onAdd={onAdd} onClose={onClose} />)
  await screen.findByRole('dialog')

  return { onAdd, onClose }
}

describe('ExercisePickerSheet', () => {
  beforeEach(() => {
    listExercises.mockReset()
    listExercises.mockResolvedValue(page())
    useMutationQueueStore.setState({ pending: [] })
  })

  // An exercise created in a gym with no signal is still an exercise this
  // session can be built out of: it carries the id it will be stored under.
  test('offers an exercise the queue has not delivered yet', async () => {
    useMutationQueueStore
      .getState()
      .enqueue(
        ExerciseService.method.createExercise,
        create(CreateExerciseRequestSchema, { id: 'sled', name: 'Sled push' }),
      )
    const { onAdd } = await renderPicker()

    await userEvent.click(await screen.findByRole('button', { name: /Sled push/ }))

    expect(onAdd.mock.calls[0]?.[0]).toMatchObject({ id: 'sled', name: 'Sled push' })
  })

  // Once the queue flushes, the library returns it too. Listing both copies
  // would offer the same movement twice.
  test('lists an exercise the backend has caught up with only once', async () => {
    listExercises.mockResolvedValue(page([bench, exercise('sled', 'Sled push')]))
    useMutationQueueStore
      .getState()
      .enqueue(
        ExerciseService.method.createExercise,
        create(CreateExerciseRequestSchema, { id: 'sled', name: 'Sled push' }),
      )
    await renderPicker()

    expect(await screen.findAllByRole('button', { name: /Sled push/ })).toHaveLength(1)
  })

  test('offers everything not already in the session', async () => {
    await renderPicker([squat.id])

    expect(await screen.findByRole('button', { name: /Bench Press/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Squat/ })).not.toBeInTheDocument()
  })

  test('hands the chosen exercise back', async () => {
    const user = userEvent.setup()
    const { onAdd } = await renderPicker()

    await user.click(await screen.findByRole('button', { name: /Bench Press/ }))

    expect(onAdd).toHaveBeenCalledWith(bench)
  })

  // Filtering what has already been fetched keeps the field responsive between
  // keystrokes; the list is short enough not to need the API for it.
  test('searches names and tags without asking the API again', async () => {
    const user = userEvent.setup()
    await renderPicker()
    await screen.findByRole('button', { name: /Bench Press/ })

    await user.type(screen.getByRole('searchbox', { name: 'Search exercises' }), 'legs')

    expect(screen.queryByRole('button', { name: /Bench Press/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Squat/ })).toBeInTheDocument()
    expect(listExercises).toHaveBeenCalledTimes(1)
  })

  test('says so when the search matches nothing', async () => {
    const user = userEvent.setup()
    await renderPicker()
    await screen.findByRole('button', { name: /Bench Press/ })

    await user.type(screen.getByRole('searchbox', { name: 'Search exercises' }), 'zzz')

    expect(screen.getByText('No exercises match your search.')).toBeInTheDocument()
  })

  test('says so when everything is already in the workout', async () => {
    await renderPicker([bench.id, squat.id])

    expect(
      await screen.findByText('All available exercises are already in this workout.'),
    ).toBeInTheDocument()
  })

  // "All available exercises are already in this workout" for a library that
  // never arrived is the one reading this picker must not offer.
  test('says the library failed rather than that everything is already added', async () => {
    listExercises.mockResolvedValue(undefined)
    await renderPicker()

    const failure = await screen.findByRole('alert')
    expect(failure).toHaveTextContent('Something went wrong')
    expect(
      screen.queryByText('All available exercises are already in this workout.'),
    ).not.toBeInTheDocument()

    listExercises.mockResolvedValue(page())
    await userEvent.click(within(failure).getByRole('button'))

    expect(await screen.findByRole('button', { name: /Bench Press/ })).toBeInTheDocument()
  })

  test('fetches the next page on request', async () => {
    const user = userEvent.setup()
    listExercises.mockResolvedValueOnce(page([bench], new Uint8Array([1])))
    listExercises.mockResolvedValueOnce(page([squat]))
    await renderPicker()

    await user.click(await screen.findByRole('button', { name: 'Load more exercises' }))

    expect(await screen.findByRole('button', { name: /Squat/ })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Load more exercises' })).not.toBeInTheDocument(),
    )
  })

  test('closes on request', async () => {
    const user = userEvent.setup()
    const { onClose } = await renderPicker()

    await user.click(screen.getByRole('button', { name: 'Close exercise picker' }))

    expect(onClose).toHaveBeenCalled()
  })

  // The sibling recorder once removed "Load more" here and left nothing in its
  // place, which is a later page the athlete cannot reach.
  test('keeps what arrived and offers a retry when a later page fails', async () => {
    const user = userEvent.setup()
    listExercises.mockResolvedValueOnce(page([bench], new Uint8Array([1])))
    listExercises.mockResolvedValueOnce(undefined)
    await renderPicker()

    await user.click(await screen.findByRole('button', { name: 'Load more exercises' }))

    const failure = await screen.findByRole('alert')
    expect(failure).toHaveTextContent('Something went wrong')
    expect(screen.getByRole('button', { name: /Bench Press/ })).toBeInTheDocument()

    listExercises.mockResolvedValueOnce(page([squat]))
    await user.click(within(failure).getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('button', { name: /Squat/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
