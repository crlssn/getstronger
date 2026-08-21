// @vitest-environment jsdom

import type { MessageInitShape } from '@bufbuild/protobuf'

import { create } from '@bufbuild/protobuf'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  listFeedItems: vi.fn(),
}))

import * as requests from '@/http/requests'
import { ListFeedItemsResponseSchema } from '@/proto/api/v1/feed_service_pb'
import { GetDashboardResponseSchema } from '@/proto/api/v1/routine_service_pb'
import { useDashboardStore } from '@/stores/dashboard'
import { useStreakStore } from '@/stores/streak'
import { renderWithProviders } from '@/ui/testing'
import { HomeView } from './HomeView'

const listFeedItems = vi.mocked(requests.listFeedItems)

const dashboard = (fields: MessageInitShape<typeof GetDashboardResponseSchema> = {}) =>
  create(GetDashboardResponseSchema, fields)

const feedPage = (workouts: { id: string; name: string }[], nextPageToken = new Uint8Array(0)) =>
  create(ListFeedItemsResponseSchema, {
    items: workouts.map((workout) => ({
      type: { case: 'workout' as const, value: { ...workout, user: { id: 'u1', username: 'bo' } } },
    })),
    pagination: { nextPageToken },
  })

const render = () => renderWithProviders(<HomeView />, { route: '/home' })

// jsdom has no IntersectionObserver. This one reports its target as visible as
// soon as it is observed, which is what a short feed looks like: the sentinel
// is on screen, so the next page is asked for straight away.
class VisibleObserver {
  constructor(private readonly notify: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.notify([{ isIntersecting: true, target } as IntersectionObserverEntry], this as never)
  }
  unobserve() {}
  disconnect() {}
}

describe('HomeView', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', VisibleObserver)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-08-14T09:00:00Z'))
    listFeedItems.mockReset()
    listFeedItems.mockResolvedValue(feedPage([]))
    vi.spyOn(useDashboardStore.getState(), 'load').mockResolvedValue(undefined)
    useDashboardStore.setState({ dashboard: undefined, loading: false })
    // The streak card fetches on mount and is covered by its own spec.
    useStreakStore.setState({ loaded: false, failed: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test('greets by the time of day', async () => {
    render()

    expect(
      await screen.findByRole('heading', { name: 'Good morning', level: 1 }),
    ).toBeInTheDocument()

    vi.setSystemTime(new Date('2026-08-14T19:00:00Z'))
    screen.getByRole('button', { name: 'Search' })
  })

  describe('up next', () => {
    test('offers the next routine, and a way to swap it', async () => {
      useDashboardStore.setState({
        dashboard: dashboard({
          nextRoutine: {
            id: 'routine-1',
            name: 'Push day',
            exercises: [{ id: 'e1' }, { id: 'e2' }],
          },
        }),
      })
      render()

      expect(await screen.findByRole('heading', { name: 'Push day' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Start workout/ })).toHaveAttribute(
        'href',
        '/workouts/routine/routine-1',
      )
      expect(screen.getByText(/2 exercises/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Choose another routine' })).toBeInTheDocument()
    })

    // Thirty minutes is the floor: a one-exercise session still means changing,
    // warming up and getting there.
    test('never estimates a session at under half an hour', async () => {
      useDashboardStore.setState({
        dashboard: dashboard({
          nextRoutine: { id: 'routine-1', name: 'Quick', exercises: [{ id: 'e1' }] },
        }),
      })
      render()

      expect(await screen.findByText(/About 30 min/)).toBeInTheDocument()
    })

    test('carries the plan through to the workout it starts', async () => {
      useDashboardStore.setState({
        dashboard: dashboard({
          nextRoutine: { id: 'routine-1', name: 'Push day', exercises: [{ id: 'e1' }] },
          activePlan: {
            id: 'plan-1',
            name: 'Push pull legs',
            currentPosition: 1,
            routines: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }],
          },
        }),
      })
      render()

      expect(await screen.findByRole('link', { name: /Start workout/ })).toHaveAttribute(
        'href',
        '/workouts/routine/routine-1?plan_id=plan-1',
      )
      // Position is one-based on screen, zero-based in the message.
      expect(screen.getByText(/2\s+of\s+3/)).toBeInTheDocument()
      expect(screen.getByText('Push pull legs')).toBeInTheDocument()
    })

    // A plan decides what comes next, so the picker would be arguing with it.
    test('replaces the routine picker with workout options under a plan', async () => {
      useDashboardStore.setState({
        dashboard: dashboard({
          nextRoutine: { id: 'routine-1', name: 'Push day', exercises: [{ id: 'e1' }] },
          activePlan: { id: 'plan-1', name: 'Push pull legs', routines: [{ id: 'r1' }] },
        }),
      })
      render()

      expect(await screen.findByRole('link', { name: 'Workout options' })).toHaveAttribute(
        'href',
        '/workout',
      )
      expect(
        screen.queryByRole('button', { name: 'Choose another routine' }),
      ).not.toBeInTheDocument()
    })

    test('asks for a first routine when there is none', async () => {
      useDashboardStore.setState({ dashboard: dashboard() })
      render()

      expect(await screen.findByText('Create your first routine')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Create routine' })).toHaveAttribute(
        'href',
        '/routines/create',
      )
    })

    test('picks a different routine and closes the sheet', async () => {
      const selectRoutine = vi
        .spyOn(useDashboardStore.getState(), 'selectRoutine')
        .mockResolvedValue(undefined)
      useDashboardStore.setState({
        dashboard: dashboard({
          nextRoutine: { id: 'routine-1', name: 'Push day', exercises: [{ id: 'e1' }] },
          routines: [
            { id: 'routine-1', name: 'Push day', exercises: [{ id: 'e1' }] },
            { id: 'routine-2', name: 'Pull day', exercises: [{ id: 'e2' }] },
          ],
        }),
      })
      render()

      await userEvent.click(await screen.findByRole('button', { name: 'Choose another routine' }))
      await userEvent.click(await screen.findByRole('button', { name: /Pull day/ }))

      expect(selectRoutine).toHaveBeenCalledWith('routine-2')
      await waitFor(() =>
        expect(screen.queryByText('Change what is up next')).not.toBeInTheDocument(),
      )
    })
  })

  describe('the feed', () => {
    test('lists the workouts of people you follow', async () => {
      listFeedItems.mockResolvedValue(feedPage([{ id: 'w1', name: 'Leg day' }]))
      render()

      expect(await screen.findByRole('heading', { name: 'Leg day' })).toBeInTheDocument()
      expect(listFeedItems).toHaveBeenCalledWith(new Uint8Array(0), true)
    })

    test('says the feed is finished once the last page lands', async () => {
      listFeedItems.mockResolvedValue(feedPage([{ id: 'w1', name: 'Leg day' }]))
      render()

      expect(await screen.findByRole('status')).toHaveTextContent("You're all caught up")
    })

    test('invites the reader to follow someone when the feed is empty', async () => {
      render()

      expect(await screen.findByText('No workouts from people you follow')).toBeInTheDocument()
    })

    // The empty state's action opens search rather than navigating, so the
    // reader can look for someone without leaving the screen.
    test('opens search from the empty feed', async () => {
      render()

      await userEvent.click(await screen.findByRole('button', { name: 'Find people' }))

      expect(screen.getByRole('searchbox')).toBeInTheDocument()
      // Search takes the whole row, so the greeting steps aside.
      expect(screen.queryByRole('heading', { name: 'Good morning' })).not.toBeInTheDocument()
    })

    test('offers a retry when the feed could not be loaded', async () => {
      listFeedItems.mockResolvedValueOnce(undefined)
      render()

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Latest workouts could not be loaded.',
      )

      listFeedItems.mockResolvedValue(feedPage([{ id: 'w1', name: 'Leg day' }]))
      await userEvent.click(within(screen.getByRole('alert')).getByRole('button'))

      expect(await screen.findByRole('heading', { name: 'Leg day' })).toBeInTheDocument()
    })

    // The same workout arriving on two pages must not become two cards.
    test('shows a workout once even if it arrives twice', async () => {
      listFeedItems
        .mockResolvedValueOnce(feedPage([{ id: 'w1', name: 'Leg day' }], new Uint8Array([1])))
        .mockResolvedValue(
          feedPage([
            { id: 'w1', name: 'Leg day' },
            { id: 'w2', name: 'Push day' },
          ]),
        )
      render()

      await waitFor(() => expect(listFeedItems).toHaveBeenCalledTimes(2))
      expect(await screen.findByRole('heading', { name: 'Push day' })).toBeInTheDocument()
      expect(screen.getAllByRole('heading', { name: 'Leg day' })).toHaveLength(1)
    })

    test('follows the page token to the next page', async () => {
      const second = new Uint8Array([1])
      listFeedItems
        .mockResolvedValueOnce(feedPage([{ id: 'w1', name: 'Leg day' }], second))
        .mockResolvedValue(feedPage([{ id: 'w2', name: 'Push day' }]))
      render()

      await waitFor(() => expect(listFeedItems).toHaveBeenCalledTimes(2))
      expect(listFeedItems).toHaveBeenLastCalledWith(second, true)
    })
  })
})
