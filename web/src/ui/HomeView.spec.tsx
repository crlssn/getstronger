// @vitest-environment jsdom

import type { MessageInitShape } from '@bufbuild/protobuf'

import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  listFeedItems: vi.fn(),
  markFeedAsSeen: vi.fn(),
}))

import * as requests from '@/http/requests'
import { ListFeedItemsResponseSchema } from '@/proto/api/v1/feed_service_pb'
import { GetDashboardResponseSchema } from '@/proto/api/v1/routine_service_pb'
import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import { useStreakStore } from '@/stores/streak'
import { renderWithProviders } from '@/ui/testing'
import { HomeView } from './HomeView'

const listFeedItems = vi.mocked(requests.listFeedItems)
const markFeedAsSeen = vi.mocked(requests.markFeedAsSeen)

const dashboard = (fields: MessageInitShape<typeof GetDashboardResponseSchema> = {}) =>
  create(GetDashboardResponseSchema, fields)

interface FeedWorkout {
  id: string
  name: string
  /** When it entered the feed; left off when a test does not care. */
  createdAt?: Date
  userId?: string
}

const feedPage = (
  workouts: FeedWorkout[],
  nextPageToken = new Uint8Array(0),
  // When the reader last saw the feed; left off for a first look.
  seenAt?: Date,
) =>
  create(ListFeedItemsResponseSchema, {
    items: workouts.map(({ createdAt, userId = 'u1', ...workout }) => ({
      type: {
        case: 'workout' as const,
        value: { ...workout, user: { id: userId, username: 'bo' } },
      },
      createdAt: createdAt && timestampFromDate(createdAt),
    })),
    pagination: { nextPageToken },
    seenAt: seenAt && timestampFromDate(seenAt),
  })

const render = () => renderWithProviders(<HomeView />, { route: '/home' })

// The badge after the copy in a picker row, which fills in on the chosen one.
const tick = (row: HTMLElement) => row.lastElementChild as HTMLElement

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
    markFeedAsSeen.mockReset()
    markFeedAsSeen.mockResolvedValue(undefined)
    useAuthStore.setState({ userId: 'me' })
    vi.spyOn(useDashboardStore.getState(), 'load').mockResolvedValue(undefined)
    useDashboardStore.setState({ dashboard: undefined, loading: false, failed: false })
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
    test('leads with the next routine and offers the rest beside it', async () => {
      useDashboardStore.setState({
        dashboard: dashboard({
          nextRoutine: {
            id: 'routine-1',
            name: 'Push day',
            exercises: [{ id: 'e1' }, { id: 'e2' }],
          },
          routines: [
            { id: 'routine-1', name: 'Push day', exercises: [{ id: 'e1' }, { id: 'e2' }] },
            { id: 'routine-2', name: 'Pull day', exercises: [{ id: 'e3' }] },
          ],
        }),
      })
      render()

      expect(await screen.findByRole('heading', { name: 'Push day' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Start Push day' })).toHaveAttribute(
        'href',
        '/workouts/routine/routine-1',
      )
      expect(screen.getByText(/2 exercises/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Start Pull day' })).toBeInTheDocument()
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

      expect(await screen.findByRole('link', { name: 'Start Push day' })).toHaveAttribute(
        'href',
        '/workouts/routine/routine-1?plan_id=plan-1',
      )
      // Position is one-based on screen, zero-based in the message.
      expect(screen.getByText(/2\s+of\s+3/)).toBeInTheDocument()
      expect(screen.getByText(/Push pull legs/)).toBeInTheDocument()
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
      expect(screen.getByRole('link', { name: 'New routine' })).toHaveAttribute(
        'href',
        '/routines/create',
      )
    })

    // Onboarding copy for a user who already has routines is the worst thing
    // this screen can say, so a failed load has to say something else.
    test('says the dashboard failed rather than asking for a first routine', async () => {
      const load = vi.spyOn(useDashboardStore.getState(), 'load').mockResolvedValue(undefined)
      useDashboardStore.setState({ dashboard: undefined, failed: true })
      render()

      expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
      expect(screen.queryByText('Create your first routine')).not.toBeInTheDocument()

      await userEvent.click(within(screen.getByRole('alert')).getByRole('button'))

      expect(load).toHaveBeenCalled()
    })

    // Starting a routine swiped to is the switch: it is what is up next the
    // next time this screen is opened.
    test('remembers the routine that was swiped to and started', async () => {
      const preferRoutine = vi.spyOn(useDashboardStore.getState(), 'preferRoutine')
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

      await userEvent.click(await screen.findByRole('link', { name: 'Start Pull day' }))

      expect(preferRoutine).toHaveBeenCalledWith('routine-2')
    })

    // Past what the row holds, the picker is still the way through the rest.
    test('picks a different routine from the picker and closes it', async () => {
      const selectRoutine = vi
        .spyOn(useDashboardStore.getState(), 'selectRoutine')
        .mockResolvedValue(undefined)
      useDashboardStore.setState({
        dashboard: dashboard({
          nextRoutine: { id: 'routine-1', name: 'Push day', exercises: [{ id: 'e1' }] },
          routines: Array.from({ length: 7 }, (_, index) => ({
            id: `routine-${index + 1}`,
            name: `Routine ${index + 1}`,
            exercises: [{ id: 'e1' }],
          })),
        }),
      })
      render()

      await userEvent.click(await screen.findByRole('button', { name: 'Choose another routine' }))
      await userEvent.click(await screen.findByRole('button', { name: /Routine 7/ }))

      expect(selectRoutine).toHaveBeenCalledWith('routine-7')
      await waitFor(() =>
        expect(screen.queryByText('Change what is up next')).not.toBeInTheDocument(),
      )
    })

    // The tick beside a row is the only thing in the sheet that says which
    // routine is already up next. It was styled by a rule reaching for
    // AppOptionRow's own '.selected' from HomeView's stylesheet, which is
    // hashed under the other module and so matched nothing: every row wore the
    // same blank badge.
    test('ticks the routine that is already up next', async () => {
      useDashboardStore.setState({
        dashboard: dashboard({
          nextRoutine: { id: 'routine-2', name: 'Routine 2', exercises: [{ id: 'e1' }] },
          // The picker only opens past what the row can hold, so it takes more
          // routines than the carousel shows.
          routines: Array.from({ length: 7 }, (_, index) => ({
            id: `routine-${index + 1}`,
            name: `Routine ${index + 1}`,
            exercises: [{ id: 'e1' }],
          })),
        }),
      })
      render()

      await userEvent.click(await screen.findByRole('button', { name: 'Choose another routine' }))

      const chosen = await screen.findByRole('button', { name: /Routine 2/, pressed: true })
      const other = screen.getByRole('button', { name: /Routine 1/, pressed: false })

      expect(tick(chosen).className).not.toEqual(tick(other).className)
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

  // A workout logged since the feed was last shown is marked as new, and is
  // marked so in words: the row's tint says nothing to a screen reader.
  describe('what is new', () => {
    const seen = new Date('2026-08-13T09:00:00Z')
    const before = new Date('2026-08-12T09:00:00Z')
    const after = new Date('2026-08-14T08:00:00Z')

    const row = async (name: string) =>
      (await screen.findByRole('heading', { name })).closest('li') as HTMLElement

    test('marks the workouts logged since the feed was last seen', async () => {
      listFeedItems.mockResolvedValue(
        feedPage(
          [
            { id: 'w1', name: 'Leg day', createdAt: after },
            { id: 'w2', name: 'Push day', createdAt: before },
          ],
          undefined,
          seen,
        ),
      )
      render()

      expect(within(await row('Leg day')).getByText('New workout')).toBeInTheDocument()
      expect(within(await row('Push day')).queryByText('New workout')).not.toBeInTheDocument()
    })

    // A first look has nothing to catch up on, so nothing is new rather than
    // everything.
    test('marks nothing on a first look at the feed', async () => {
      listFeedItems.mockResolvedValue(feedPage([{ id: 'w1', name: 'Leg day', createdAt: after }]))
      render()

      expect(within(await row('Leg day')).queryByText('New workout')).not.toBeInTheDocument()
    })

    test('never marks your own workout as new', async () => {
      listFeedItems.mockResolvedValue(
        feedPage([{ id: 'w1', name: 'Leg day', createdAt: after, userId: 'me' }], undefined, seen),
      )
      render()

      expect(within(await row('Leg day')).queryByText('New workout')).not.toBeInTheDocument()
    })

    // Shown is seen: nothing has to be opened for the next visit to start
    // from here.
    test('tells the server the feed has been seen once the first page lands', async () => {
      listFeedItems.mockResolvedValue(feedPage([{ id: 'w1', name: 'Leg day' }]))
      render()

      await row('Leg day')
      await waitFor(() => expect(markFeedAsSeen).toHaveBeenCalledTimes(1))
    })

    test('does not call the feed seen until it has been shown', async () => {
      listFeedItems.mockResolvedValueOnce(undefined)
      render()

      expect(await screen.findByRole('alert')).toBeInTheDocument()
      expect(markFeedAsSeen).not.toHaveBeenCalled()

      listFeedItems.mockResolvedValue(feedPage([{ id: 'w1', name: 'Leg day' }]))
      await userEvent.click(within(screen.getByRole('alert')).getByRole('button'))

      await row('Leg day')
      await waitFor(() => expect(markFeedAsSeen).toHaveBeenCalledTimes(1))
    })

    // The first page moves the line to now, so a later page reports it there.
    // What was new when the reader arrived stays new for the whole visit.
    test('keeps the line where the first page drew it for the pages after', async () => {
      listFeedItems
        .mockResolvedValueOnce(
          feedPage([{ id: 'w1', name: 'Leg day', createdAt: after }], new Uint8Array([1]), seen),
        )
        .mockResolvedValue(
          feedPage(
            [{ id: 'w2', name: 'Push day', createdAt: after }],
            undefined,
            new Date('2026-08-14T09:00:00Z'),
          ),
        )
      render()

      expect(within(await row('Push day')).getByText('New workout')).toBeInTheDocument()
      expect(markFeedAsSeen).toHaveBeenCalledTimes(1)
    })
  })
})
