// @vitest-environment jsdom

import { create } from '@bufbuild/protobuf'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  getCurrentUser: vi.fn(),
  updateUserWeightUnit: vi.fn(),
  updateUserDistanceUnit: vi.fn(),
  updateUserAutofillSets: vi.fn(),
  updateUserUsername: vi.fn(),
  updateUserName: vi.fn(),
  deleteAccount: vi.fn(),
}))

import { Code, ConnectError } from '@connectrpc/connect'

import * as requests from '@/http/requests'
import { DeleteAccountResponseSchema } from '@/proto/api/v1/auth_service_pb'
import { GetDashboardResponseSchema } from '@/proto/api/v1/routine_service_pb'
import { DistanceUnit, WeightUnit } from '@/proto/api/v1/shared_pb'
import {
  GetUserResponseSchema,
  UpdateUserAutofillSetsResponseSchema,
  UpdateUserNameResponseSchema,
  UpdateUserDistanceUnitResponseSchema,
  UpdateUserUsernameResponseSchema,
  UpdateUserWeightUnitResponseSchema,
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
  updateUserWeightUnit: vi.mocked(requests.updateUserWeightUnit),
  updateUserDistanceUnit: vi.mocked(requests.updateUserDistanceUnit),
  updateUserAutofillSets: vi.mocked(requests.updateUserAutofillSets),
  updateUserUsername: vi.mocked(requests.updateUserUsername),
  updateUserName: vi.mocked(requests.updateUserName),
  deleteAccount: vi.mocked(requests.deleteAccount),
}

const me = 'user-me'

const profile = (fields: { username?: string; name?: string; autofillSets?: boolean } = {}) =>
  create(GetUserResponseSchema, {
    user: {
      id: me,
      name: fields.name ?? 'Alex Morgan',
      username: fields.username ?? 'alex',
      email: 'alex@example.com',
      weightUnit: WeightUnit.KILOGRAMS,
      distanceUnit: DistanceUnit.KILOMETERS,
      autofillSets: fields.autofillSets ?? false,
    },
  })

const updated = () => ({ user: profile().user })

const render = () => renderWithProviders(<ProfileView />, { route: '/profile' })

const group = (label: string) => within(screen.getByRole('group', { name: label }))

/** The screen fetches before it renders anything, so specs wait for it. */
const loaded = () => screen.findByRole('heading', { name: 'Alex Morgan' })

describe('ProfileView', () => {
  beforeEach(() => {
    Object.values(mocked).forEach((mock) => mock.mockReset())
    mocked.getCurrentUser.mockResolvedValue(profile())
    mocked.updateUserWeightUnit.mockResolvedValue(
      create(UpdateUserWeightUnitResponseSchema, updated()),
    )
    mocked.updateUserDistanceUnit.mockResolvedValue(
      create(UpdateUserDistanceUnitResponseSchema, updated()),
    )
    mocked.updateUserAutofillSets.mockResolvedValue(
      create(UpdateUserAutofillSetsResponseSchema, updated()),
    )
    mocked.updateUserUsername.mockResolvedValue(create(UpdateUserUsernameResponseSchema, updated()))
    mocked.deleteAccount.mockResolvedValue(create(DeleteAccountResponseSchema, {}))
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

  describe.each([
    ['Preferred weight unit', 'lbs', () => mocked.updateUserWeightUnit, WeightUnit.POUNDS],
    ['Preferred distance unit', 'mi', () => mocked.updateUserDistanceUnit, DistanceUnit.MILES],
  ] as const)('%s', (label, option, request, expected) => {
    test('is applied straight away and then saved', async () => {
      render()

      await loaded()
      await userEvent.click(group(label).getByRole('button', { name: option }))

      expect(group(label).getByRole('button', { name: option })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await waitFor(() => expect(request()).toHaveBeenCalledWith(expected))
      expect(useToastStore.getState().toast?.type).toBe('success')
    })

    // The request helper is silent for network-level failures, so the revert
    // has to explain itself or the control appears to snap back on its own.
    test('reverts and says why when the request fails', async () => {
      request().mockResolvedValue(undefined)
      render()

      await loaded()
      await userEvent.click(group(label).getByRole('button', { name: option }))

      await waitFor(() =>
        expect(group(label).getByRole('button', { name: option })).toHaveAttribute(
          'aria-pressed',
          'false',
        ),
      )
      expect(useToastStore.getState().toast?.type).toBe('error')
    })

    test('does nothing when the current option is picked again', async () => {
      render()

      await loaded()
      await userEvent.click(group(label).getAllByRole('button')[0]!)

      expect(request()).not.toHaveBeenCalled()
    })
  })

  // A boolean is a switch, not an Off/On segmented control.
  test('switches autofill on and off', async () => {
    render()

    await loaded()
    await userEvent.click(screen.getByRole('switch', { name: 'Repeat my last set' }))

    await waitFor(() => expect(mocked.updateUserAutofillSets).toHaveBeenCalledWith(true))
    expect(usePreferencesStore.getState().autofillSets).toBe(true)
  })

  // One action for the card, not a pencil per field: two 20px pencils were
  // under the tap-target floor, and the one after the name pinned the heading
  // into a column narrow enough to truncate it with 90px going spare.
  describe('the profile editor', () => {
    const open = async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Edit profile' }))
      return {
        name: screen.getByRole('textbox', { name: 'Name' }),
        username: screen.getByRole('textbox', { name: 'Username' }),
      }
    }

    test('is the only way into either field', async () => {
      render()

      expect(await screen.findByRole('button', { name: 'Edit profile' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Change name' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Change username' })).not.toBeInTheDocument()
    })

    test('opens with both fields as they stand', async () => {
      render()

      const fields = await open()
      expect(fields.name).toHaveValue('Alex Morgan')
      expect(fields.username).toHaveValue('alex')
    })

    // Usernames are lower-case, so the field settles the case rather than
    // rejecting what was typed.
    test('lower-cases the username as it is typed', async () => {
      render()

      const { username } = await open()
      await userEvent.clear(username)
      await userEvent.type(username, 'Alex.Morgan')

      expect(username).toHaveValue('alex.morgan')
    })

    test('saves both fields and closes', async () => {
      mocked.updateUserName.mockResolvedValue(
        create(UpdateUserNameResponseSchema, { user: profile({ name: 'Alexandra Morgan' }).user }),
      )
      mocked.updateUserUsername.mockResolvedValue(
        create(UpdateUserUsernameResponseSchema, { user: profile({ username: 'newalex' }).user }),
      )
      render()

      const fields = await open()
      await userEvent.clear(fields.name)
      await userEvent.type(fields.name, 'Alexandra Morgan')
      await userEvent.clear(fields.username)
      await userEvent.type(fields.username, 'newalex')
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(mocked.updateUserName).toHaveBeenCalledWith('Alexandra Morgan'))
      await waitFor(() => expect(mocked.updateUserUsername).toHaveBeenCalledWith('newalex'))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.getByRole('heading', { name: 'Alexandra Morgan' })).toBeInTheDocument()
      expect(screen.getByText('@newalex')).toBeInTheDocument()
    })

    // An untouched field is not an edit, so it is not sent.
    test('sends only the field that changed', async () => {
      mocked.updateUserName.mockResolvedValue(
        create(UpdateUserNameResponseSchema, { user: profile({ name: 'Alexandra Morgan' }).user }),
      )
      render()

      const fields = await open()
      await userEvent.clear(fields.name)
      await userEvent.type(fields.name, 'Alexandra Morgan')
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(mocked.updateUserName).toHaveBeenCalled())
      expect(mocked.updateUserUsername).not.toHaveBeenCalled()
    })

    // A taken username surfaces through the request helper's own toast, so the
    // sheet stays open for the draft to be corrected — and the name that did
    // save is not rolled back with it.
    test('keeps a saved name when the username is refused', async () => {
      mocked.updateUserName.mockResolvedValue(
        create(UpdateUserNameResponseSchema, { user: profile({ name: 'Alexandra Morgan' }).user }),
      )
      mocked.updateUserUsername.mockResolvedValue(undefined)
      render()

      const fields = await open()
      await userEvent.clear(fields.name)
      await userEvent.type(fields.name, 'Alexandra Morgan')
      await userEvent.clear(fields.username)
      await userEvent.type(fields.username, 'taken')
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(mocked.updateUserUsername).toHaveBeenCalled())
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Alexandra Morgan' })).toBeInTheDocument()
    })

    // The action sits beside the heading, not inside it, so the heading's
    // accessible name stays the name itself.
    test('keeps the action out of the heading', async () => {
      render()

      expect(await screen.findByRole('heading', { name: 'Alex Morgan' })).toBeInTheDocument()
    })
  })

  // Three levels of alarm for something done once: the only filled red button
  // in the app, in a tinted red card, under a red-outlined log out. Both are
  // plain rows now, and the red waits in the confirmation.
  test('offers the way out and the way off as two plain rows', async () => {
    render()

    const account = within(await screen.findByRole('region', { name: 'Account' }))
    expect(account.getByRole('link', { name: /Log out/ })).toHaveAttribute('href', '/logout')
    expect(account.getByRole('button', { name: /Delete account/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Danger zone' })).not.toBeInTheDocument()
  })

  // Both app stores require the account to be deletable from inside the app.
  describe('deleting the account', () => {
    const open = async () => {
      render()
      await loaded()
      await userEvent.click(
        within(screen.getByRole('region', { name: 'Account' })).getByRole('button', {
          name: /Delete account/,
        }),
      )

      return screen.getByLabelText('Confirm with your password')
    }

    test('is reachable from the profile', async () => {
      render()

      expect(await screen.findByRole('link', { name: /Privacy policy/ })).toHaveAttribute(
        'href',
        '/privacy',
      )
    })

    test('asks for the password before erasing anything', async () => {
      await open()

      expect(screen.getByRole('dialog')).toHaveTextContent('cannot be undone')
      expect(mocked.deleteAccount).not.toHaveBeenCalled()
    })

    test('deletes the account and leaves for the login screen', async () => {
      const field = await open()
      await userEvent.type(field, 'password')
      await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }))

      await waitFor(() => expect(mocked.deleteAccount).toHaveBeenCalledWith('password'))
      await waitFor(() => expect(useAuthStore.getState().accessToken).toBe(''))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      // The toast outlives the navigation on its own clock, so it is still
      // readable on the login screen the app leaves for.
      expect(useToastStore.getState().toast).toMatchObject({
        message: 'Your account has been deleted.',
        type: 'success',
      })
    })

    // The password was only ever typed into the sheet, so a rejection has to
    // land there rather than in a toast behind it.
    test('keeps the sheet open when the password is wrong', async () => {
      mocked.deleteAccount.mockRejectedValue(new ConnectError('nope', Code.InvalidArgument))
      const field = await open()
      await userEvent.type(field, 'wrong')
      await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('That password is not correct.')
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(useAuthStore.getState().userId).toBe(me)
    })
  })
})
