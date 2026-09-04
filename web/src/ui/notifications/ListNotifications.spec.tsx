// @vitest-environment jsdom

import type { MessageInitShape } from '@bufbuild/protobuf'

import { create } from '@bufbuild/protobuf'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  listNotifications: vi.fn(),
  markNotificationAsRead: vi.fn(),
}))

import * as requests from '@/http/requests'
import {
  ListNotificationsResponseSchema,
  MarkNotificationsAsReadResponseSchema,
} from '@/proto/api/v1/notification_service_pb'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notifications'
import { usePageNavActionStore } from '@/stores/pageNavAction'
import { renderWithProviders } from '@/ui/testing'
import { ListNotifications } from './ListNotifications'

const mocked = {
  listNotifications: vi.mocked(requests.listNotifications),
  markNotificationAsRead: vi.mocked(requests.markNotificationAsRead),
}

type NotificationInit = NonNullable<
  MessageInitShape<typeof ListNotificationsResponseSchema>['notifications']
>[number]

const page = (notifications: NotificationInit[], nextPageToken = new Uint8Array(0)) =>
  create(ListNotificationsResponseSchema, {
    notifications,
    pagination: { nextPageToken },
  })

const follow = (id: string, read = false): NotificationInit => ({
  id,
  read,
  notifiedAtUnix: 1_755_000_000n,
  type: { case: 'userFollowed' as const, value: { actor: { id: 'u2', username: 'alex' } } },
})

const comment = (id: string, ownerId: string): NotificationInit => ({
  id,
  read: false,
  notifiedAtUnix: 1_755_000_000n,
  type: {
    case: 'workoutComment' as const,
    value: {
      actor: { id: 'u2', username: 'alex' },
      workout: { id: 'w1', name: 'Leg day', user: { id: ownerId, username: 'sam' } },
    },
  },
})

const render = () => renderWithProviders(<ListNotifications />, { route: '/notifications' })

// The mark-all button portals into the nav bar's action slot, which only a
// mounted nav bar publishes.
const navActionSlot = () => {
  const slot = document.createElement('div')
  document.body.append(slot)
  usePageNavActionStore.setState({ container: slot })
  return slot
}

describe('ListNotifications', () => {
  beforeEach(() => {
    Object.values(mocked).forEach((mock) => mock.mockReset())
    mocked.listNotifications.mockResolvedValue(page([]))
    mocked.markNotificationAsRead.mockResolvedValue(
      create(MarkNotificationsAsReadResponseSchema, {}),
    )
    vi.spyOn(useNotificationStore.getState(), 'refreshUnreadNotifications').mockResolvedValue()
    useNotificationStore.setState({ unreadCount: 0 })
    useAuthStore.setState({ userId: 'me' })
    navActionSlot()
  })

  afterEach(() => {
    usePageNavActionStore.setState({ container: null })
  })

  test('says so when there is nothing to catch up on', async () => {
    render()

    expect(await screen.findByText('No notifications yet')).toBeInTheDocument()
  })

  test('says the fetch failed rather than that there is nothing', async () => {
    mocked.listNotifications.mockResolvedValue(undefined)
    render()

    const failure = await screen.findByRole('alert')
    expect(failure).toHaveTextContent('Something went wrong')
    expect(screen.queryByText('No notifications yet')).not.toBeInTheDocument()

    mocked.listNotifications.mockResolvedValue(page([follow('n1')]))
    await userEvent.click(within(failure).getByRole('button'))

    expect(await screen.findByRole('link')).toBeInTheDocument()
  })

  test('names who followed you, and links to them', async () => {
    mocked.listNotifications.mockResolvedValue(page([follow('n1')]))
    render()

    const row = await screen.findByRole('link')
    expect(row).toHaveTextContent('@alex followed you')
    expect(row).toHaveAttribute('href', '/users/u2')
  })

  // The owner changes the sentence, not just a word, so each case is its own
  // message rather than a name slotted into one.
  test.each([
    ['me', '@alex commented on your Leg day workout'],
    ['u2', '@alex commented on their Leg day workout'],
    ['someone-else', 'alex commented on @sam’s Leg day workout'],
  ])('tells a comment on a %s workout apart', async (ownerId, expected) => {
    mocked.listNotifications.mockResolvedValue(page([comment('n1', ownerId)]))
    render()

    const row = await screen.findByRole('link')
    expect(row).toHaveTextContent(expected)
    expect(row).toHaveAttribute('href', '/workouts/w1')
  })

  // A row that navigates says so, here as everywhere else.
  test('ends each row with a chevron', async () => {
    mocked.listNotifications.mockResolvedValue(page([follow('n1')]))
    render()

    const row = (await screen.findByRole('link')).closest('li')!
    // The row's own icon, then the chevron the list item ends with.
    expect(row.querySelectorAll(':scope > svg')).toHaveLength(1)
  })

  test('calls out an unread row for a screen reader', async () => {
    mocked.listNotifications.mockResolvedValue(page([follow('n1'), follow('n2', true)]))
    render()

    await screen.findAllByRole('listitem')
    expect(screen.getAllByText('Unread notification')).toHaveLength(1)
  })

  // Marked on the tap, not on the round trip: the row and the tab-bar count
  // both answer straight away.
  test('marks a row read when it is opened', async () => {
    mocked.listNotifications.mockResolvedValue(page([follow('n1')]))
    useNotificationStore.setState({ unreadCount: 1 })
    render()

    await userEvent.click(await screen.findByRole('link'))

    expect(useNotificationStore.getState().unreadCount).toBe(0)
    await waitFor(() => expect(screen.queryByText('Unread notification')).not.toBeInTheDocument())
    expect(mocked.markNotificationAsRead).toHaveBeenCalledWith('n1', true)
  })

  test('does not report a row that was already read', async () => {
    mocked.listNotifications.mockResolvedValue(page([follow('n1', true)]))
    render()

    await userEvent.click(await screen.findByRole('link'))

    expect(mocked.markNotificationAsRead).not.toHaveBeenCalled()
  })

  describe('mark all as read', () => {
    test('is offered only while something is unread', async () => {
      mocked.listNotifications.mockResolvedValue(page([follow('n1', true)]))
      const { unmount } = render()

      await screen.findByRole('link')
      expect(screen.queryByRole('button', { name: /Mark all/ })).not.toBeInTheDocument()
      unmount()

      mocked.listNotifications.mockResolvedValue(page([follow('n2')]))
      render()
      expect(await screen.findByRole('button', { name: 'Mark all read' })).toBeInTheDocument()
    })

    test('clears every row and the count', async () => {
      mocked.listNotifications.mockResolvedValue(page([follow('n1'), follow('n2')]))
      useNotificationStore.setState({ unreadCount: 2 })
      render()

      await userEvent.click(await screen.findByRole('button', { name: 'Mark all read' }))

      expect(mocked.markNotificationAsRead).toHaveBeenCalledWith()
      await waitFor(() => expect(useNotificationStore.getState().unreadCount).toBe(0))
      expect(screen.queryByText('Unread notification')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Mark all/ })).not.toBeInTheDocument()
    })

    test('says it is working while the request is out', async () => {
      let finish: () => void = () => {}
      mocked.markNotificationAsRead.mockReturnValue(
        new Promise((resolve) => {
          finish = () => resolve(create(MarkNotificationsAsReadResponseSchema, {}))
        }),
      )
      mocked.listNotifications.mockResolvedValue(page([follow('n1')]))
      render()

      await userEvent.click(await screen.findByRole('button', { name: 'Mark all read' }))

      const button = screen.getByRole('button', { name: 'Marking as read…' })
      expect(button).toBeDisabled()

      finish()
      await waitFor(() => expect(useNotificationStore.getState().unreadCount).toBe(0))
    })
  })

  test('follows the page token to the next page', async () => {
    // jsdom has no IntersectionObserver; this one reports the list's sentinel
    // as visible the moment it appears, which is what a short list looks like.
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private readonly notify: IntersectionObserverCallback) {}
        observe(target: Element) {
          this.notify(
            [{ isIntersecting: true, target } as IntersectionObserverEntry],
            this as never,
          )
        }
        unobserve() {}
        disconnect() {}
      },
    )

    const second = new Uint8Array([1])
    mocked.listNotifications
      .mockResolvedValueOnce(page([follow('n1')], second))
      .mockResolvedValue(page([comment('n2', 'me')]))
    render()

    await waitFor(() => expect(mocked.listNotifications).toHaveBeenCalledTimes(2))
    expect(mocked.listNotifications).toHaveBeenLastCalledWith(second)
    expect(await screen.findByText(/commented on your/)).toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
