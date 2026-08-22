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

    expect(await screen.findByRole('heading', { name: 'Alex Morgan' })).toBeInTheDocument()
    // Rendered through handle(), so a missing username is not a lone '@'.
    expect(screen.getByText('@alex')).toBeInTheDocument()
    expect(screen.getByText('alex@example.com')).toBeInTheDocument()
    // Initials, because there are no avatars in the app.
    expect(screen.getByText('AM')).toBeInTheDocument()
  })

  test('summarises how training is going', async () => {
    useDashboardStore.setState({
      dashboard: create(GetDashboardResponseSchema, {
        recentWorkouts: [{ id: 'w1' }, { id: 'w2' }],
        personalBests: [{ set: { id: 's1' } }],
        volumeThisWeek: 4200,
      }),
    })
    render()

    const stats = within(await screen.findByRole('region', { name: 'Training summary' }))
    expect(stats.getByText('2')).toBeInTheDocument()
    expect(stats.getByText('1')).toBeInTheDocument()
    expect(stats.getByText('4,200 kg')).toBeInTheDocument()
  })

  describe('the notification badge', () => {
    test('stays away at zero', async () => {
      render()

      const link = await screen.findByRole('link', { name: 'Notifications' })
      expect(link).toHaveAttribute('href', '/notifications')
      expect(link).toHaveTextContent('')
    })

    test('counts what is unread', async () => {
      useNotificationStore.setState({ unreadCount: 7 })
      render()

      expect(await screen.findByRole('link', { name: 'Notifications' })).toHaveTextContent('7')
    })

    // Past this the badge is wider than the icon it sits on.
    test('caps at 99+', async () => {
      useNotificationStore.setState({ unreadCount: 250 })
      render()

      expect(await screen.findByRole('link', { name: 'Notifications' })).toHaveTextContent('99+')
    })
  })

  describe.each([
    ['Preferred weight unit', 'Pounds', () => mocked.updateUserWeightUnit, WeightUnit.POUNDS],
    ['Preferred distance unit', 'Miles', () => mocked.updateUserDistanceUnit, DistanceUnit.MILES],
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

  test('switches autofill on and off', async () => {
    render()

    await loaded()
    await userEvent.click(group('Repeat my last set').getByRole('button', { name: 'On' }))

    await waitFor(() => expect(mocked.updateUserAutofillSets).toHaveBeenCalledWith(true))
    expect(usePreferencesStore.getState().autofillSets).toBe(true)
  })

  describe('the username editor', () => {
    const open = async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Change username' }))
      return screen.getByRole('textbox', { name: 'Username' })
    }

    test('opens with the current username', async () => {
      render()

      expect(await open()).toHaveValue('alex')
    })

    // Usernames are lower-case, so the field settles the case rather than
    // rejecting what was typed.
    test('lower-cases what is typed', async () => {
      render()

      const field = await open()
      await userEvent.clear(field)
      await userEvent.type(field, 'Alex.Morgan')

      expect(field).toHaveValue('alex.morgan')
    })

    test('saves the new username and closes', async () => {
      mocked.updateUserUsername.mockResolvedValue(
        create(UpdateUserUsernameResponseSchema, { user: profile({ username: 'newalex' }).user }),
      )
      render()

      const field = await open()
      await userEvent.clear(field)
      await userEvent.type(field, 'newalex')
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(mocked.updateUserUsername).toHaveBeenCalledWith('newalex'))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.getByText('@newalex')).toBeInTheDocument()
    })

    // A taken username surfaces through the request helper's own toast, so the
    // sheet stays open for the draft to be corrected.
    test('stays open when the name could not be saved', async () => {
      mocked.updateUserUsername.mockResolvedValue(undefined)
      render()

      await open()
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(mocked.updateUserUsername).toHaveBeenCalled())
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  describe('the name editor', () => {
    const open = async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Change name' }))
      return screen.getByRole('textbox', { name: 'Name' })
    }

    test('opens with the current name', async () => {
      render()

      expect(await open()).toHaveValue('Alex Morgan')
    })

    test('saves the new name and closes', async () => {
      mocked.updateUserName.mockResolvedValue(
        create(UpdateUserNameResponseSchema, { user: profile({ name: 'Alexandra Morgan' }).user }),
      )
      render()

      const field = await open()
      await userEvent.clear(field)
      await userEvent.type(field, 'Alexandra Morgan')
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(mocked.updateUserName).toHaveBeenCalledWith('Alexandra Morgan'))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.getByRole('heading', { name: 'Alexandra Morgan' })).toBeInTheDocument()
    })

    // The pencil sits beside the heading, not inside it, so the heading's
    // accessible name stays the name itself.
    test('keeps the pencil out of the heading', async () => {
      render()

      expect(await screen.findByRole('heading', { name: 'Alex Morgan' })).toBeInTheDocument()
    })
  })

  test('offers the way out', async () => {
    render()

    expect(await screen.findByRole('link', { name: /Log out/ })).toHaveAttribute('href', '/logout')
  })

  // Both app stores require the account to be deletable from inside the app.
  describe('deleting the account', () => {
    const open = async () => {
      render()
      await loaded()
      await userEvent.click(
        within(screen.getByRole('region', { name: 'Danger zone' })).getByRole('button', {
          name: 'Delete account',
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
      // The confirmation is raised for the login screen the app leaves for.
      expect(useAlertStore.getState().alert).toEqual({
        message: 'Your account has been deleted.',
        seen: false,
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
