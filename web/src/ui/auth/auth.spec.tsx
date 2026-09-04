// @vitest-environment jsdom

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  login: vi.fn(),
  logout: vi.fn(),
  signup: vi.fn(),
  verifyEmail: vi.fn(),
  resetPassword: vi.fn(),
  updatePassword: vi.fn(),
}))

import * as requests from '@/http/requests'
import { useToastStore } from '@/stores/toasts'
import { useAuthStore } from '@/stores/auth'
import { useEmailVerificationStore } from '@/stores/emailVerification'
import { usePreferencesStore } from '@/stores/preferences'
import { renderWithProviders } from '@/ui/testing'
import { ForgotPassword } from './ForgotPassword'
import { ResetPassword } from './ResetPassword'
import { UserLogin } from './UserLogin'
import { UserLogout } from './UserLogout'
import { UserSignup } from './UserSignup'
import { VerifyEmail } from './VerifyEmail'

const mocked = {
  login: vi.mocked(requests.login),
  logout: vi.mocked(requests.logout),
  signup: vi.mocked(requests.signup),
  verifyEmail: vi.mocked(requests.verifyEmail),
  resetPassword: vi.mocked(requests.resetPassword),
  updatePassword: vi.mocked(requests.updatePassword),
}

/** Renders a screen with somewhere for it to navigate to. */
const renderScreen = (element: React.ReactElement, route = '/') =>
  renderWithProviders(
    <Routes>
      <Route path="*" element={element} />
    </Routes>,
    { route },
  )

const field = (label: string | RegExp) => screen.getByLabelText(label)
const submit = async (name: string | RegExp) =>
  await userEvent.click(screen.getByRole('button', { name }))

// A signed JWT is not needed; setAccessToken only reads the payload.
const fakeToken = (userId: string) =>
  `header.${btoa(JSON.stringify({ userId })).replace(/=+$/, '')}.signature`

beforeEach(() => {
  Object.values(mocked).forEach((mock) => mock.mockReset())
  useAuthStore.setState({ userId: '', accessToken: '' })
  useToastStore.getState().dismiss()
  useEmailVerificationStore.getState().clear()
})

describe('UserLogin', () => {
  test('signs the user in with what they typed', async () => {
    mocked.login.mockResolvedValue({ accessToken: fakeToken('user-1') } as never)
    renderScreen(<UserLogin />)

    await userEvent.type(field('Email address'), 'alex@example.com')
    await userEvent.type(field('Password'), 'password123')
    await submit('Log in')

    expect(mocked.login).toHaveBeenCalledWith('alex@example.com', 'password123')
    expect(useAuthStore.getState().userId).toBe('user-1')
  })

  // A rejected sign-in must not leave the app half signed in.
  test('stays signed out when the details do not match', async () => {
    mocked.login.mockResolvedValue(undefined)
    renderScreen(<UserLogin />)

    await userEvent.type(field('Email address'), 'alex@example.com')
    await userEvent.type(field('Password'), 'wrong')
    await submit('Log in')

    expect(useAuthStore.getState().accessToken).toBe('')
  })

  // With the server unreachable, tapping "Log in" used to do nothing at all:
  // no alert, no pending state, no reaction of any kind.
  test('reacts to the submit while the request is out', async () => {
    let land: (value: undefined) => void = () => {}
    mocked.login.mockReturnValue(new Promise<undefined>((resolve) => (land = resolve)))
    renderScreen(<UserLogin />)

    await userEvent.type(field('Email address'), 'alex@example.com')
    await userEvent.type(field('Password'), 'password123')
    await submit('Log in')

    const button = await screen.findByRole('button', { name: 'Logging in…' })
    expect(button).toBeDisabled()

    land(undefined)

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeEnabled()
  })

  // The visible "Password" used to be a <span>, so the one thing that binds a
  // label to a field — tapping it puts the cursor in the field, and a screen
  // reader reads them as one — was missing on the screen everyone starts on.
  test('binds the password label to the field it names', () => {
    renderScreen(<UserLogin />)

    const label = screen.getByText('Password')
    expect(label.tagName).toBe('LABEL')
    expect(label).toHaveAttribute('for', field('Password').id)
  })

  test('offers a way to recover a password and to sign up', () => {
    renderScreen(<UserLogin />)

    expect(screen.getByRole('link', { name: /Forgot/ })).toHaveAttribute('href', '/forgot-password')
    expect(screen.getByRole('link', { name: /Create an account/ })).toHaveAttribute(
      'href',
      '/signup',
    )
  })
})

describe('the password field on an auth screen', () => {
  test('hides the password until the user asks to see it', async () => {
    renderScreen(<UserLogin />)

    expect(field('Password')).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: /Show password/ }))

    expect(field('Password')).toHaveAttribute('type', 'text')
  })

  test('says whether the password is showing', async () => {
    renderScreen(<UserLogin />)
    const toggle = () => screen.getByRole('button', { name: /password/ })

    expect(toggle()).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('UserSignup', () => {
  const fillIn = async () => {
    await userEvent.type(field('Name'), 'Alex Morgan')
    // The name suggests a username, so a chosen one replaces it rather than
    // being typed onto the end.
    await userEvent.clear(field('Username'))
    await userEvent.type(field('Username'), 'AlexMorgan')
    await userEvent.type(field('Email address'), 'alex@example.com')
    await userEvent.type(field('Password'), 'password123')
    await userEvent.type(field(/Confirm password/), 'password123')
  }

  // Usernames are case-insensitive to the backend, so folding here stops the
  // account reading differently from how it is addressed.
  test('folds the username to lower case as it is typed', async () => {
    renderScreen(<UserSignup />)

    await userEvent.type(field('Username'), 'AlexMorgan')

    expect(field('Username')).toHaveValue('alexmorgan')
  })

  test('suggests a username from the name as it is typed', async () => {
    renderScreen(<UserSignup />)

    await userEvent.type(field('Name'), 'Al')
    // Two characters cannot be a username, so nothing is suggested yet.
    expect(field('Username')).toHaveValue('')

    await userEvent.type(field('Name'), 'ex Morgan')
    expect(field('Username')).toHaveValue('alexmorgan')
  })

  test('leaves a username alone once it has been typed in', async () => {
    renderScreen(<UserSignup />)

    await userEvent.type(field('Name'), 'Alex Morgan')
    await userEvent.type(field('Username'), '.m')
    await userEvent.type(field('Name'), '-Reid')

    expect(field('Username')).toHaveValue('alexmorgan.m')
  })

  test('suggests again once the username is cleared', async () => {
    renderScreen(<UserSignup />)

    await userEvent.type(field('Name'), 'Alex Morgan')
    await userEvent.clear(field('Username'))
    await userEvent.type(field('Name'), '-Reid')

    expect(field('Username')).toHaveValue('alexmorganreid')
  })

  test('creates the account with what was typed', async () => {
    mocked.signup.mockResolvedValue({} as never)
    renderScreen(<UserSignup />)

    await fillIn()
    await submit('Create an account')

    expect(mocked.signup).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Alex Morgan',
        username: 'alexmorgan',
        email: 'alex@example.com',
      }),
    )
  })

  // Signup sends the first verification email, so the resend cooldown starts
  // here rather than on the pending page.
  test('starts the resend cooldown for the address it signed up', async () => {
    mocked.signup.mockResolvedValue({} as never)
    renderScreen(<UserSignup />)

    await fillIn()
    await submit('Create an account')

    expect(useEmailVerificationStore.getState().pendingEmail).toBe('alex@example.com')
    expect(useEmailVerificationStore.getState().lastSentAt).not.toBe(0)
  })

  test('records nothing when the account was not created', async () => {
    mocked.signup.mockResolvedValue(undefined)
    renderScreen(<UserSignup />)

    await fillIn()
    await submit('Create an account')

    expect(useEmailVerificationStore.getState().pendingEmail).toBe('')
  })
})

describe('ForgotPassword', () => {
  test('asks for a reset link', async () => {
    mocked.resetPassword.mockResolvedValue({} as never)
    renderScreen(<ForgotPassword />)

    await userEvent.type(field('Email address'), 'alex@example.com')
    await submit(/Send/)

    expect(mocked.resetPassword).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'alex@example.com' }),
    )
  })

  // The confirmation belongs beside the address it was sent to.
  test('confirms on the spot and clears the field', async () => {
    mocked.resetPassword.mockResolvedValue({} as never)
    renderScreen(<ForgotPassword />)

    await userEvent.type(field('Email address'), 'alex@example.com')
    await submit(/Send/)

    expect(useToastStore.getState().toast).not.toBeNull()
    expect(field('Email address')).toHaveValue('')
  })

  test('says nothing when the request failed', async () => {
    mocked.resetPassword.mockResolvedValue(undefined)
    renderScreen(<ForgotPassword />)

    await userEvent.type(field('Email address'), 'alex@example.com')
    await submit(/Send/)

    expect(useToastStore.getState().toast).toBeNull()
  })
})

describe('ResetPassword', () => {
  test('sends the new password with the token from the link', async () => {
    mocked.updatePassword.mockResolvedValue({} as never)
    renderScreen(<ResetPassword />, '/reset-password?token=abc123')

    await userEvent.type(field(/New password/), 'password123')
    await userEvent.type(field(/Confirm new password/), 'password123')
    await submit(/Update password/)

    expect(mocked.updatePassword).toHaveBeenCalledWith(
      expect.objectContaining({
        password: 'password123',
        passwordConfirmation: 'password123',
        token: 'abc123',
      }),
    )
  })
})

describe('VerifyEmail', () => {
  test('verifies with the token from the link', async () => {
    mocked.verifyEmail.mockResolvedValue({} as never)
    renderScreen(<VerifyEmail />, '/verify-email?token=abc123')

    await waitFor(() => expect(mocked.verifyEmail).toHaveBeenCalledWith('abc123'))
  })

  // Nothing is pending any more, so the recovery page no longer has an address
  // to offer.
  test('clears the pending address once verified', async () => {
    useEmailVerificationStore.getState().markSent('alex@example.com')
    mocked.verifyEmail.mockResolvedValue({} as never)
    renderScreen(<VerifyEmail />, '/verify-email?token=abc123')

    await waitFor(() => expect(useEmailVerificationStore.getState().pendingEmail).toBe(''))
    expect(useToastStore.getState().toast).not.toBeNull()
  })

  // A dead or reused link has to explain itself rather than showing nothing.
  test('explains a link that did not work', async () => {
    mocked.verifyEmail.mockResolvedValue(undefined)
    renderScreen(<VerifyEmail />, '/verify-email?token=stale')

    await waitFor(() => expect(mocked.verifyEmail).toHaveBeenCalled())
    expect(screen.getByText(/verify your email/i)).toBeInTheDocument()
  })

  // The token is single-use.
  test('spends the token once', async () => {
    mocked.verifyEmail.mockResolvedValue({} as never)
    const { rerender } = renderScreen(<VerifyEmail />, '/verify-email?token=abc123')

    rerender(
      <Routes>
        <Route path="*" element={<VerifyEmail />} />
      </Routes>,
    )
    await waitFor(() => expect(mocked.verifyEmail).toHaveBeenCalledTimes(1))
  })
})

describe('UserLogout', () => {
  test('ends the session everywhere it is held', async () => {
    useAuthStore.setState({ userId: 'user-1', accessToken: 'token' })
    usePreferencesStore.getState().setAutofillSets(true)
    mocked.logout.mockResolvedValue({} as never)
    renderScreen(<UserLogout />)

    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe(''))
    expect(usePreferencesStore.getState().autofillSets).toBe(false)
  })

  // Signing out twice would revoke a token the backend has already revoked.
  test('tells the backend once', async () => {
    mocked.logout.mockResolvedValue({} as never)
    const { rerender } = renderScreen(<UserLogout />)

    rerender(
      <Routes>
        <Route path="*" element={<UserLogout />} />
      </Routes>,
    )
    await waitFor(() => expect(mocked.logout).toHaveBeenCalledTimes(1))
  })
})
