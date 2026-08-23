// @vitest-environment jsdom

import { create } from '@bufbuild/protobuf'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  searchUsers: vi.fn(),
  listRoutines: vi.fn(),
  listPlans: vi.fn(),
  listExercises: vi.fn(),
}))

import * as requests from '@/http/requests'
import {
  ListPlansResponseSchema,
  ListRoutinesResponseSchema,
} from '@/proto/api/v1/routine_service_pb'
import { SearchUsersResponseSchema } from '@/proto/api/v1/user_service_pb'
import { ListExercisesResponseSchema } from '@/proto/api/v1/exercise_service_pb'
import { renderWithProviders } from '@/ui/testing'
import { HomePageActions } from './HomePageActions'

const mocked = {
  searchUsers: vi.mocked(requests.searchUsers),
  listRoutines: vi.mocked(requests.listRoutines),
  listPlans: vi.mocked(requests.listPlans),
  listExercises: vi.mocked(requests.listExercises),
}

const emptyResults = () => {
  mocked.searchUsers.mockResolvedValue(create(SearchUsersResponseSchema, {}))
  mocked.listRoutines.mockResolvedValue(create(ListRoutinesResponseSchema, {}))
  mocked.listPlans.mockResolvedValue(create(ListPlansResponseSchema, {}))
  mocked.listExercises.mockResolvedValue(create(ListExercisesResponseSchema, {}))
}

const withResults = () => {
  mocked.searchUsers.mockResolvedValue(
    create(SearchUsersResponseSchema, {
      users: [{ id: 'user-1', username: 'alex', name: 'Alex Morgan' }],
    }),
  )
  mocked.listRoutines.mockResolvedValue(
    create(ListRoutinesResponseSchema, {
      routines: [{ id: 'routine-1', name: 'Push day', exercises: [{ id: 'e1' }, { id: 'e2' }] }],
    }),
  )
  mocked.listPlans.mockResolvedValue(
    create(ListPlansResponseSchema, {
      plans: [
        { id: 'plan-1', name: 'Push pull legs', routines: [{ id: 'r1' }] },
        { id: 'plan-2', name: 'Something else', routines: [] },
      ],
    }),
  )
  mocked.listExercises.mockResolvedValue(
    create(ListExercisesResponseSchema, { exercises: [{ id: 'ex-1', name: 'Bench press' }] }),
  )
}

const field = () => screen.getByRole('searchbox')

const renderOpen = () => {
  const onOpenChange = vi.fn()
  const view = renderWithProviders(<HomePageActions open onOpenChange={onOpenChange} />)
  return { ...view, onOpenChange }
}

// The debounce means a typed query only searches once the timer fires.
const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300)
  })
}

describe('HomePageActions', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    Object.values(mocked).forEach((mock) => mock.mockReset())
    emptyResults()
  })

  test('offers a way to open search when it is closed', async () => {
    const onOpenChange = vi.fn()
    renderWithProviders(<HomePageActions open={false} onOpenChange={onOpenChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  test('puts the cursor in the field as soon as it opens', () => {
    renderOpen()

    expect(field()).toHaveFocus()
  })

  test('says what to type before anything has been searched', () => {
    renderOpen()

    expect(screen.getByText('Type at least 3 characters to search.')).toBeInTheDocument()
  })

  // Two characters cannot usefully narrow anything, so the request is not made.
  test('waits for three characters before searching', async () => {
    renderOpen()

    await userEvent.type(field(), 'be')
    await settle()

    expect(mocked.searchUsers).not.toHaveBeenCalled()
    expect(screen.getByText('Type at least 3 characters to search.')).toBeInTheDocument()
  })

  test('groups what it found by what it is', async () => {
    withResults()
    renderOpen()

    await userEvent.type(field(), 'push')
    await settle()

    expect(await screen.findByRole('link', { name: /alex/ })).toHaveAttribute(
      'href',
      '/users/user-1',
    )
    expect(screen.getByRole('link', { name: /Push day/ })).toHaveAttribute(
      'href',
      '/routines/routine-1',
    )
    expect(screen.getByRole('link', { name: /Push pull legs/ })).toHaveAttribute(
      'href',
      '/plans/plan-1',
    )
    expect(screen.getByRole('link', { name: /Bench press/ })).toHaveAttribute(
      'href',
      '/exercises/ex-1',
    )
  })

  // The plans endpoint takes no query, so a plan that does not match must be
  // filtered out here rather than shown as a result.
  test('keeps only the plans whose name matches', async () => {
    withResults()
    renderOpen()

    await userEvent.type(field(), 'push')
    await settle()

    await screen.findByRole('link', { name: /Push pull legs/ })
    expect(screen.queryByRole('link', { name: /Something else/ })).not.toBeInTheDocument()
  })

  test('says so when nothing matched', async () => {
    renderOpen()

    await userEvent.type(field(), 'zzz')
    await settle()

    expect(await screen.findByText('Nothing found for “zzz”.')).toBeInTheDocument()
  })

  // Four endpoints answer one question, so "nothing found" is only true when
  // all four actually answered.
  test('says the search failed rather than that nothing matched', async () => {
    Object.values(mocked).forEach((mock) => mock.mockResolvedValue(undefined))
    renderOpen()

    await userEvent.type(field(), 'bench')
    await settle()

    const failure = await screen.findByRole('alert')
    expect(failure).toHaveTextContent('The search could not be completed.')
    expect(screen.queryByText('Nothing found for “bench”.')).not.toBeInTheDocument()

    withResults()
    await userEvent.click(within(failure).getByRole('button'))
    await settle()

    expect(await screen.findByText('Bench press')).toBeInTheDocument()
  })

  // One search per typed word, not one per keystroke.
  test('searches once for a word typed in one go', async () => {
    renderOpen()

    await userEvent.type(field(), 'bench')
    await settle()

    expect(mocked.searchUsers).toHaveBeenCalledTimes(1)
    expect(mocked.searchUsers).toHaveBeenCalledWith('bench', new Uint8Array(0))
  })

  // A slow early request must not land on top of a later one's results.
  test('shows the newest query, whichever request finishes first', async () => {
    type SearchResult = Awaited<ReturnType<typeof requests.searchUsers>>
    let finishFirst: (value: SearchResult) => void = () => {}
    mocked.searchUsers.mockReturnValueOnce(
      new Promise<SearchResult>((resolve) => {
        finishFirst = resolve
      }),
    )
    renderOpen()

    await userEvent.type(field(), 'push')
    await settle()

    withResults()
    await userEvent.clear(field())
    await userEvent.type(field(), 'bench')
    await settle()

    await act(async () => {
      finishFirst(
        create(SearchUsersResponseSchema, { users: [{ id: 'stale', username: 'stale' }] }),
      )
    })

    expect(screen.queryByRole('link', { name: /stale/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /alex/ })).toBeInTheDocument()
  })

  test('closes and forgets what was searched', async () => {
    withResults()
    const { onOpenChange } = renderOpen()

    await userEvent.type(field(), 'push')
    await settle()
    await screen.findByRole('link', { name: /Push day/ })

    await userEvent.click(screen.getByRole('button', { name: 'Close search' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(field()).toHaveValue('')
    expect(screen.queryByRole('link', { name: /Push day/ })).not.toBeInTheDocument()
  })

  test('closes on escape', async () => {
    const { onOpenChange } = renderOpen()

    await userEvent.type(field(), '{Escape}')

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  test('drops the results when the query is cut back below three characters', async () => {
    withResults()
    renderOpen()

    await userEvent.type(field(), 'push')
    await settle()
    await screen.findByRole('link', { name: /Push day/ })

    await userEvent.type(field(), '{Backspace}{Backspace}')
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /Push day/ })).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Type at least 3 characters to search.')).toBeInTheDocument()
  })
})
