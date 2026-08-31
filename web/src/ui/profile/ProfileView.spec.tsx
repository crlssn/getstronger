// @vitest-environment jsdom

import { create } from '@bufbuild/protobuf'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  getCurrentUser: vi.fn(),
  updateUserAutofillSets: vi.fn(),
}))

import * as requests from '@/http/requests'
import { GetDashboardResponseSchema } from '@/proto/api/v1/routine_service_pb'
import { DistanceUnit, WeightUnit } from '@/proto/api/v1/shared_pb'
import {
  GetUserResponseSchema,
  UpdateUserAutofillSetsResponseSchema,
} from '@/proto/api/v1/user_service_pb'
import { useToastStore } from '@/stores/toasts'
import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import { useNotificationStore } from '@/stores/notifications'
import { usePreferencesStore } from '@/stores/preferences'
import { renderWithProviders } from '@/ui/testing'
import { ProfileView } from './ProfileView'

const mocked = {
  getCurrentUser: vi.mocked(requests.getCurrentUser),
  updateUserAutofillSets: vi.mocked(requests.updateUserAutofillSets),
}

const me = 'user-me'

const profile = (
  fields: {
    username?: string
    name?: string
    autofillSets?: boolean
    weightUnit?: WeightUnit
    distanceUnit?: DistanceUnit
  } = {},
) =>
  create(GetUserResponseSchema, {
    user: {
      id: me,
      name: fields.name ?? 'Alex Morgan',
      username: fields.username ?? 'alex',
      email: 'alex@example.com',
      weightUnit: fields.weightUnit ?? WeightUnit.KILOGRAMS,
      distanceUnit: fields.distanceUnit ?? DistanceUnit.KILOMETERS,
      autofillSets: fields.autofillSets ?? false,
    },
  })

const updated = () => ({ user: profile().user })

const render = () => renderWithProviders(<ProfileView />, { route: '/profile' })

/** The screen fetches before it renders anything, so specs wait for it. */
const loaded = () => screen.findByRole('heading', { name: 'Alex Morgan' })

describe('ProfileView', () => {
  beforeEach(() => {
    Object.values(mocked).forEach((mock) => mock.mockReset())
    mocked.getCurrentUser.mockResolvedValue(profile())
    mocked.updateUserAutofillSets.mockResolvedValue(
      create(UpdateUserAutofillSetsResponseSchema, updated()),
    )
    vi.spyOn(useDashboardStore.getState(), 'load').mockResolvedValue(undefined)
    vi.spyOn(useNotificationStore.getState(), 'refreshUnreadNotifications').mockResolvedValue()
    useAuthStore.setState({ userId: me })
    useNotificationStore.setState({ unreadCount: 0 })
    useDashboardStore.setState({ dashboard: undefined })
    usePreferencesStore.setState({
      weightUnit: WeightUnit.KILOGRAMS,
      distanceUnit: DistanceUnit.KILOMETERS,
      autofillSets: false,
    })
    useToastStore.getState().dismiss()
  })

  test('leads with who you are', async () => {
    render()

    // A tab root opens with the page header's h1, and the account card's name
    // sits under it as an h2 rather than as a second title.
    expect(await screen.findByRole('heading', { name: 'Me', level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Alex Morgan' })).toBeInTheDocument()
    // Rendered through handle(), so a missing username is not a lone '@'.
    expect(screen.getByText('@alex')).toBeInTheDocument()
    expect(screen.getByText('alex@example.com')).toBeInTheDocument()
    // Initials, because there are no avatars in the app.
    expect(screen.getByText('AM')).toBeInTheDocument()
  })

  // The tab has no list to fall back to, so the skeleton was the whole page:
  // a fetch that failed left it pulsating with no way to ask again.
  describe('when the profile does not load', () => {
    test('offers a retry rather than a skeleton that never resolves', async () => {
      mocked.getCurrentUser.mockResolvedValue(undefined)
      render()

      expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    })

    test('shows the profile once the retry lands', async () => {
      mocked.getCurrentUser.mockResolvedValueOnce(undefined)
      render()

      await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))

      expect(await screen.findByRole('heading', { name: 'Alex Morgan' })).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  test('summarises how training is going', async () => {
    useDashboardStore.setState({
      dashboard: create(GetDashboardResponseSchema, {
        // The dashboard sends a three-workout preview; the stat is the total
        // beside it, so it must not be counted off the preview.
        workoutCount: 1284,
        recentWorkouts: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }],
        personalBests: [{ set: { id: 's1' } }],
        volumeThisWeek: 4200,
      }),
    })
    render()

    const stats = within(await screen.findByRole('region', { name: 'Training summary' }))
    expect(stats.getByText('1,284')).toBeInTheDocument()
    expect(stats.queryByText('3')).not.toBeInTheDocument()
    expect(stats.getByText('1')).toBeInTheDocument()
    expect(stats.getByText('4,200 kg')).toBeInTheDocument()
  })

  describe('the notification badge', () => {
    test('stays away at zero', async () => {
      render()

      // Named without a count, and nothing drawn on it: the exact name is the
      // assertion, because the stats strip below has its own zeroes.
      const link = await screen.findByRole('link', { name: 'Notifications' })
      expect(link).toHaveAttribute('href', '/notifications')
      expect(link.parentElement).toHaveTextContent('')
    })

    // The count is in the control's name as well as on it: a red disc says
    // nothing to a reader who cannot see it.
    test('counts what is unread', async () => {
      useNotificationStore.setState({ unreadCount: 7 })
      render()

      expect(
        await screen.findByRole('link', { name: 'Notifications, 7 unread' }),
      ).toBeInTheDocument()
      expect(screen.getByText('7')).toBeVisible()
    })

    // Past this the badge is wider than the icon it sits on. The name still
    // says the real number — it is the disc that runs out of room, not the
    // sentence.
    test('caps at 99+', async () => {
      useNotificationStore.setState({ unreadCount: 250 })
      render()

      expect(
        await screen.findByRole('link', { name: 'Notifications, 250 unread' }),
      ).toBeInTheDocument()
      expect(screen.getByText('99+')).toBeVisible()
    })
  })

  // The value nobody has to open anything to read is the one they came to
  // check, so the row that opens a setting says what it is set to.
  test('opens each setting from a row that says what it is set to', async () => {
    mocked.getCurrentUser.mockResolvedValue(
      profile({ weightUnit: WeightUnit.POUNDS, distanceUnit: DistanceUnit.MILES }),
    )
    render()

    await loaded()
    const settings = within(await screen.findByRole('region', { name: 'Settings' }))
    const units = settings.getByRole('link', { name: /Units/ })
    expect(units).toHaveAttribute('href', '/settings/units')
    expect(units).toHaveTextContent('lbs · mi')

    // The language in its own name, which is what the screen behind the row
    // lists it as.
    const language = settings.getByRole('link', { name: /Language/ })
    expect(language).toHaveAttribute('href', '/settings/language')
    expect(language).toHaveTextContent('English')
  })

  // A boolean is a switch, not an Off/On segmented control.
  test('switches autofill on and off', async () => {
    render()

    await loaded()
    await userEvent.click(screen.getByRole('switch', { name: 'Repeat my last set' }))

    await waitFor(() => expect(mocked.updateUserAutofillSets).toHaveBeenCalledWith(true))
    expect(usePreferencesStore.getState().autofillSets).toBe(true)
  })

  // Three levels of alarm for something done once: the only filled red button
  // in the app, in a tinted red card, under a red-outlined log out. The
  // destructive half sits behind the account screen now, and what stays on the
  // tab is the single tap.
  test('keeps the way out on the tab and the way off behind the account', async () => {
    render()

    const settings = within(await screen.findByRole('region', { name: 'Settings' }))
    const account = settings.getByRole('link', { name: /Account/ })
    expect(account).toHaveAttribute('href', '/settings/account')

    expect(screen.getByRole('link', { name: /Log out/ })).toHaveAttribute('href', '/logout')
    expect(screen.queryByRole('button', { name: /Delete account/ })).not.toBeInTheDocument()
  })

  // The card's own action is the affordance that says the name and the
  // username can be changed; it opens the screen that changes them.
  test('opens the account screen from the card as well as from the group', async () => {
    render()

    expect(await screen.findByRole('link', { name: /Edit profile/ })).toHaveAttribute(
      'href',
      '/settings/account',
    )
  })

  test('is where the privacy policy is reached from', async () => {
    render()

    expect(await screen.findByRole('link', { name: /Privacy policy/ })).toHaveAttribute(
      'href',
      '/privacy',
    )
  })
})
