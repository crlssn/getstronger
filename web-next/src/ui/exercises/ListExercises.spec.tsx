// @vitest-environment jsdom

import type { MessageInitShape } from '@bufbuild/protobuf'

import { create } from '@bufbuild/protobuf'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateTime } from 'luxon'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  listExercises: vi.fn(),
}))

import * as requests from '@/http/requests'
import { ListExercisesResponseSchema } from '@/proto/api/v1/exercise_service_pb'
import { ExerciseMetric } from '@/proto/api/v1/shared_pb'
import { useActivityStore } from '@/stores/activity'
import { renderWithProviders } from '@/ui/testing'
import { ListExercises } from './ListExercises'

const listExercises = vi.mocked(requests.listExercises)

type ExerciseInit = NonNullable<
  MessageInitShape<typeof ListExercisesResponseSchema>['exercises']
>[number]

const page = (exercises: ExerciseInit[], nextPageToken = new Uint8Array(0)) =>
  create(ListExercisesResponseSchema, { exercises, pagination: { nextPageToken } })

const bench: ExerciseInit = {
  id: 'bench',
  name: 'Bench press',
  tags: ['Chest', 'Push'],
  metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
}
const run: ExerciseInit = {
  id: 'run',
  name: 'Treadmill run',
  tags: [],
  metrics: [ExerciseMetric.DISTANCE, ExerciseMetric.TIME],
}

const daysAgo = (days: number) => DateTime.now().minus({ days }).toISO() ?? ''

const render = () => renderWithProviders(<ListExercises />, { route: '/exercises' })

const groupNamed = (label: string) =>
  screen.getByRole('heading', { name: label, level: 2 }).parentElement!

describe('ListExercises', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-08-14T12:00:00Z'))
    listExercises.mockReset()
    listExercises.mockResolvedValue(page([bench, run]))
    vi.spyOn(useActivityStore.getState(), 'load').mockResolvedValue(undefined)
    useActivityStore.setState({ exerciseLastPerformed: {}, loaded: true, failed: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('lists each exercise, linked to itself', async () => {
    render()

    expect(await screen.findByRole('link', { name: /Bench press/ })).toHaveAttribute(
      'href',
      '/exercises/bench',
    )
  })

  // The row's meta line says how the exercise is tracked, then where it bites.
  test('says how each exercise is tracked and what it works', async () => {
    render()

    expect(await screen.findByText('Weight × Reps · Chest, Push')).toBeInTheDocument()
    expect(screen.getByText('Distance × Time')).toBeInTheDocument()
  })

  test('groups by when each was last trained', async () => {
    useActivityStore.setState({
      exerciseLastPerformed: { bench: daysAgo(0), run: daysAgo(200) },
    })
    render()

    await screen.findByRole('link', { name: /Bench press/ })
    expect(
      within(groupNamed('Today')).getByRole('link', { name: /Bench press/ }),
    ).toBeInTheDocument()
    expect(
      within(groupNamed('Older than a month')).getByRole('link', { name: /Treadmill run/ }),
    ).toBeInTheDocument()
  })

  describe('search', () => {
    test('matches on the name', async () => {
      render()

      await screen.findByRole('link', { name: /Bench press/ })
      await userEvent.type(screen.getByRole('searchbox'), 'tread')

      expect(screen.getByRole('link', { name: /Treadmill run/ })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /Bench press/ })).not.toBeInTheDocument()
    })

    test('matches on a tag too', async () => {
      render()

      await screen.findByRole('link', { name: /Bench press/ })
      await userEvent.type(screen.getByRole('searchbox'), 'chest')

      expect(screen.getByRole('link', { name: /Bench press/ })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /Treadmill run/ })).not.toBeInTheDocument()
    })

    // Offering "create an exercise" for a search that found nothing would name
    // it after the query, which is not what the reader asked for.
    test('offers no create action when a search comes up empty', async () => {
      render()

      await screen.findByRole('link', { name: /Bench press/ })
      await userEvent.type(screen.getByRole('searchbox'), 'zzz')

      expect(screen.getByText('No matching exercises')).toBeInTheDocument()
      // Only the header's, not one inside the empty state.
      expect(screen.getAllByRole('link', { name: /New exercise/ })).toHaveLength(1)
    })
  })

  test('asks for a first exercise when the library is empty', async () => {
    listExercises.mockResolvedValue(page([]))
    render()

    expect(await screen.findByText('No exercises yet')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /New exercise/ })[0]).toHaveAttribute(
      'href',
      '/exercises/create',
    )
  })

  test('loads another page on request', async () => {
    const second = new Uint8Array([1])
    listExercises.mockResolvedValueOnce(page([bench], second)).mockResolvedValue(page([run]))
    render()

    await userEvent.click(await screen.findByRole('button', { name: 'Load more exercises' }))

    await waitFor(() => expect(listExercises).toHaveBeenLastCalledWith(second))
    expect(await screen.findByRole('link', { name: /Treadmill run/ })).toBeInTheDocument()
  })

  test('stops offering more once the last page has landed', async () => {
    render()

    await screen.findByRole('link', { name: /Bench press/ })
    expect(screen.queryByRole('button', { name: 'Load more exercises' })).not.toBeInTheDocument()
  })
})
