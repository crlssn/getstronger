// @vitest-environment jsdom

import { create } from '@bufbuild/protobuf'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  deleteAccount: vi.fn(),
  getCurrentUser: vi.fn(),
  resetPassword: vi.fn(),
  updateUserName: vi.fn(),
  updateUserUsername: vi.fn(),
}))

import { Code, ConnectError } from '@connectrpc/connect'

import * as requests from '@/http/requests'
import {
  DeleteAccountResponseSchema,
  ResetPasswordResponseSchema,
} from '@/proto/api/v1/auth_service_pb'
import {
  GetUserResponseSchema,
  UpdateUserNameResponseSchema,
  UpdateUserUsernameResponseSchema,
} from '@/proto/api/v1/user_service_pb'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toasts'
import { renderWithProviders } from '@/ui/testing'
import { AccountSettings } from './AccountSettings'

const mocked = {
  deleteAccount: vi.mocked(requests.deleteAccount),
  getCurrentUser: vi.mocked(requests.getCurrentUser),
  resetPassword: vi.mocked(requests.resetPassword),
  updateUserName: vi.mocked(requests.updateUserName),
  updateUserUsername: vi.mocked(requests.updateUserUsername),
}

const me = 'user-me'

const account = (fields: { name?: string; username?: string } = {}) =>
  create(GetUserResponseSchema, {
    user: {
      id: me,
      name: fields.name ?? 'Alex Morgan',
      username: fields.username ?? 'alex',
      email: 'alex@example.com',
    },
  })

const render = () => renderWithProviders(<AccountSettings />, { route: '/settings/account' })

const fields = async () => ({
  name: await screen.findByRole('textbox', { name: 'Name' }),
  username: screen.getByRole('textbox', { name: 'Username' }),
})

describe('AccountSettings', () => {
  beforeEach(() => {
    Object.values(mocked).forEach((mock) => mock.mockReset())
    mocked.getCurrentUser.mockResolvedValue(account())
    mocked.updateUserName.mockResolvedValue(
      create(UpdateUserNameResponseSchema, { user: account().user }),
    )
    mocked.updateUserUsername.mockResolvedValue(
      create(UpdateUserUsernameResponseSchema, { user: account().user }),
    )
    mocked.resetPassword.mockResolvedValue(create(ResetPasswordResponseSchema, {}))
    mocked.deleteAccount.mockResolvedValue(create(DeleteAccountResponseSchema, {}))
    useAuthStore.setState({ userId: me, accessToken: 'token' })
    useToastStore.getState().dismiss()
  })

  test('opens on the account as it stands', async () => {
    render()

    const form = await fields()
    expect(form.name).toHaveValue('Alex Morgan')
    expect(form.username).toHaveValue('alex')
    expect(screen.getByText('alex@example.com')).toBeInTheDocument()
  })

  // The screen has nothing to show until the account answers, and a fetch that
  // fails leaves a dead end without a way to ask again.
  describe('when the account does not load', () => {
    test('offers a retry rather than a skeleton that never resolves', async () => {
      mocked.getCurrentUser.mockResolvedValue(undefined)
      render()

      expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    })

    test('shows the account once the retry lands', async () => {
      mocked.getCurrentUser.mockResolvedValueOnce(undefined)
      render()

      await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))

      expect((await fields()).name).toHaveValue('Alex Morgan')
    })
  })

  describe('the details', () => {
    // Nothing is sent until save is pressed, and there is nothing to send
    // until something changed — which is what the disabled button says.
    test('waits for an edit before it can be saved', async () => {
      render()

      const form = await fields()
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()

      await userEvent.type(form.name, 'a')

      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    })

    // Usernames are lower-case, so the field settles the case rather than
    // rejecting what was typed.
    test('lower-cases the username as it is typed', async () => {
      render()

      const form = await fields()
      await userEvent.clear(form.username)
      await userEvent.type(form.username, 'Alex.Morgan')

      expect(form.username).toHaveValue('alex.morgan')
    })

    test('saves both fields', async () => {
      mocked.updateUserName.mockResolvedValue(
        create(UpdateUserNameResponseSchema, { user: account({ name: 'Alexandra Morgan' }).user }),
      )
      mocked.updateUserUsername.mockResolvedValue(
        create(UpdateUserUsernameResponseSchema, { user: account({ username: 'newalex' }).user }),
      )
      render()

      const form = await fields()
      await userEvent.clear(form.name)
      await userEvent.type(form.name, 'Alexandra Morgan')
      await userEvent.clear(form.username)
      await userEvent.type(form.username, 'newalex')
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => expect(mocked.updateUserName).toHaveBeenCalledWith('Alexandra Morgan'))
      await waitFor(() => expect(mocked.updateUserUsername).toHaveBeenCalledWith('newalex'))
      expect(useToastStore.getState().toast).toMatchObject({ message: 'Profile updated' })
    })

    // An untouched field is not an edit, so it is not sent.
    test('sends only the field that changed', async () => {
      mocked.updateUserName.mockResolvedValue(
        create(UpdateUserNameResponseSchema, { user: account({ name: 'Alexandra Morgan' }).user }),
      )
      render()

      const form = await fields()
      await userEvent.clear(form.name)
      await userEvent.type(form.name, 'Alexandra Morgan')
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => expect(mocked.updateUserName).toHaveBeenCalled())
      expect(mocked.updateUserUsername).not.toHaveBeenCalled()
    })

    // A refused username must not roll back a name that already landed, and
    // the draft stays on screen to be corrected.
    test('keeps a saved name when the username is refused', async () => {
      mocked.updateUserName.mockResolvedValue(
        create(UpdateUserNameResponseSchema, { user: account({ name: 'Alexandra Morgan' }).user }),
      )
      mocked.updateUserUsername.mockResolvedValue(undefined)
      render()

      const form = await fields()
      await userEvent.clear(form.name)
      await userEvent.type(form.name, 'Alexandra Morgan')
      await userEvent.clear(form.username)
      await userEvent.type(form.username, 'taken')
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

      expect(await screen.findByRole('alert')).toBeInTheDocument()
      expect(form.name).toHaveValue('Alexandra Morgan')
      expect(form.username).toHaveValue('taken')
    })
  })

  // No new password is typed here: the address on the account is what proves
  // it is the owner asking, so the link goes there and the change is made
  // behind it.
  describe('the password', () => {
    test('emails a reset link to the account', async () => {
      render()

      await userEvent.click(await screen.findByRole('button', { name: 'Send reset link' }))

      await waitFor(() =>
        expect(mocked.resetPassword).toHaveBeenCalledWith(
          expect.objectContaining({ email: 'alex@example.com' }),
        ),
      )
      expect(useToastStore.getState().toast).toMatchObject({
        message: expect.stringContaining('inbox') as string,
      })
    })

    test('says so on the row when the link cannot be sent', async () => {
      mocked.resetPassword.mockResolvedValue(undefined)
      render()

      await userEvent.click(await screen.findByRole('button', { name: 'Send reset link' }))

      expect(await screen.findByRole('alert')).toBeInTheDocument()
      expect(useToastStore.getState().toast).toBeNull()
    })
  })

  // Both app stores require an account made in the app to be deletable from
  // inside it, and the red waits in the confirmation rather than in the row.
  describe('deleting the account', () => {
    const open = async () => {
      render()
      await userEvent.click(await screen.findByRole('button', { name: /Delete account/ }))
      return screen.getByLabelText('Confirm with your password')
    }

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
      expect(useToastStore.getState().toast).toMatchObject({
        message: 'Your account has been deleted.',
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
