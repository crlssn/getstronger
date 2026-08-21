// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'

const { createWorkout, getUser, login, markNotificationsAsRead, resendVerificationEmail } =
  vi.hoisted(() => ({
    createWorkout: vi.fn(),
    getUser: vi.fn(),
    login: vi.fn(),
    markNotificationsAsRead: vi.fn(),
    resendVerificationEmail: vi.fn(),
  }))

vi.mock('./clients', () => ({
  authClient: { login, resendVerificationEmail },
  exerciseClient: {},
  feedClient: {},
  notificationClient: { markNotificationsAsRead },
  routineClient: {},
  userClient: { getUser },
  workoutClient: { createWorkout },
}))

import { Error as ApiError, ErrorDetailSchema } from '@/proto/api/v1/errors_pb'
import { setNavigator, type Navigate } from '@/router/navigation'
import { useAlertStore } from '@/stores/alerts'
import { useAuthStore } from '@/stores/auth'
import { useEmailVerificationStore } from '@/stores/emailVerification'
import {
  createWorkout as createAWorkout,
  getCurrentUser,
  login as logIn,
  markNotificationAsRead,
  resendVerificationEmail as resend,
  verifyEmailPendingPath,
} from './requests'

const navigate = vi.fn<Navigate>()

beforeEach(() => {
  navigate.mockReset()
  setNavigator(navigate)
})

afterEach(() => {
  setNavigator(undefined)
})

describe('markNotificationAsRead', () => {
  beforeEach(() => {
    markNotificationsAsRead.mockReset()
    markNotificationsAsRead.mockResolvedValue({})
  })

  it('sends a notification ID when marking one notification', async () => {
    const notificationId = 'c772e4cd-4b23-44df-bddd-22c96a444055'

    await markNotificationAsRead(notificationId)

    expect(markNotificationsAsRead).toHaveBeenCalledWith(
      expect.objectContaining({ notificationId }),
    )
  })

  it('omits the notification ID when marking every notification', async () => {
    await markNotificationAsRead()

    expect(markNotificationsAsRead).toHaveBeenCalledWith(
      expect.not.objectContaining({ notificationId: expect.anything() }),
    )
  })

  it('suppresses failures for best-effort item updates', async () => {
    markNotificationsAsRead.mockRejectedValue(new Error('network unavailable'))

    await expect(
      markNotificationAsRead('c772e4cd-4b23-44df-bddd-22c96a444055', true),
    ).resolves.toBe(undefined)
  })
})

describe('login', () => {
  beforeEach(() => {
    login.mockReset()
    useEmailVerificationStore.getState().clear()
  })

  it('sends an unverified account to the pending verification page', async () => {
    login.mockRejectedValue(
      new ConnectError('unverified', Code.FailedPrecondition, undefined, [
        {
          desc: ErrorDetailSchema,
          value: create(ErrorDetailSchema, { error: ApiError.EMAIL_NOT_VERIFIED }),
        },
      ]),
    )

    await logIn('alex.morgan@example.com', 'password123')

    // Pushed rather than replaced: the login screen stays in history, so a
    // user who mistyped their address can go back to it.
    expect(navigate).toHaveBeenCalledWith(
      verifyEmailPendingPath,
      expect.not.objectContaining({ replace: true }),
    )
    expect(useEmailVerificationStore.getState().pendingEmail).toBe('alex.morgan@example.com')
  })

  it('leaves other failures to the generic error handling', async () => {
    login.mockRejectedValue(new ConnectError('invalid credentials', Code.InvalidArgument))
    vi.stubGlobal('alert', vi.fn())

    await logIn('alex.morgan@example.com', 'wrong')

    expect(navigate).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('resendVerificationEmail', () => {
  beforeEach(() => {
    resendVerificationEmail.mockReset()
  })

  it('returns the cooldown the server is enforcing', async () => {
    resendVerificationEmail.mockResolvedValue({ retryAfterSeconds: 60 })

    await expect(resend('alex.morgan@example.com')).resolves.toEqual({ retryAfterSeconds: 60 })
    expect(resendVerificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'alex.morgan@example.com' }),
    )
  })

  it('reports failures to the caller instead of interrupting with a dialog', async () => {
    const alerted = vi.fn()
    vi.stubGlobal('alert', alerted)
    resendVerificationEmail.mockRejectedValue(new ConnectError('unavailable', Code.Internal))

    await expect(resend('alex.morgan@example.com')).resolves.toBe(undefined)
    expect(alerted).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

// Every request in this module routes its failures through one shared
// tryCatch, so these cover the behaviour all ~90 of them inherit.
describe('shared error handling', () => {
  const detailed = (error: ApiError) =>
    new ConnectError('rejected', Code.FailedPrecondition, undefined, [
      { desc: ErrorDetailSchema, value: create(ErrorDetailSchema, { error }) },
    ])

  beforeEach(() => {
    getUser.mockReset()
    createWorkout.mockReset()
    useAlertStore.setState({ alert: null })
    useAuthStore.setState({ userId: 'user-1', accessToken: 'token' })
  })

  it('surfaces an application error as an alert', async () => {
    getUser.mockRejectedValue(new ConnectError('exercise not found', Code.InvalidArgument))

    await getCurrentUser('user-1')

    expect(useAlertStore.getState().alert).toMatchObject({
      type: 'error',
      message: expect.stringContaining('exercise not found'),
    })
  })

  // These say the request never landed rather than that it was refused, so an
  // alert would blame the user for their connection.
  it.each([Code.Unknown, Code.Canceled, Code.Unavailable])(
    'stays quiet about a %i failure',
    async (code) => {
      getUser.mockRejectedValue(new ConnectError('transport', code))

      await getCurrentUser('user-1')

      expect(useAlertStore.getState().alert).toBeNull()
    },
  )

  it('ends the session when the server rejects the token', async () => {
    getUser.mockRejectedValue(new ConnectError('expired', Code.Unauthenticated))

    await getCurrentUser('user-1')

    expect(useAuthStore.getState().accessToken).toBe('')
    expect(navigate).toHaveBeenCalledWith('/login', { replace: true })
  })

  // A missing current user means the account is gone, not that a lookup
  // missed, so it ends the session like an expired token.
  it('ends the session when the current user has gone missing', async () => {
    getUser.mockRejectedValue(new ConnectError('no such user', Code.NotFound))

    await getCurrentUser('user-1')

    expect(useAuthStore.getState().accessToken).toBe('')
  })

  it('translates a known error detail rather than showing the raw message', async () => {
    getUser.mockRejectedValue(detailed(ApiError.PASSWORDS_DO_NOT_MATCH))

    await getCurrentUser('user-1')

    expect(useAlertStore.getState().alert).toMatchObject({
      type: 'error',
      message: 'Passwords do not match',
    })
  })

  // The caller queues the workout for a later retry, which it can only do if
  // the failure reaches it.
  it('rethrows a failed workout save instead of swallowing it', async () => {
    createWorkout.mockRejectedValue(new ConnectError('offline', Code.Unavailable))

    await expect(createAWorkout({} as never)).rejects.toThrow(ConnectError)
  })

  it('resolves with the response when nothing fails', async () => {
    getUser.mockResolvedValue({ user: { id: 'user-1' } })

    await expect(getCurrentUser('user-1')).resolves.toEqual({ user: { id: 'user-1' } })
    expect(useAlertStore.getState().alert).toBeNull()
  })
})
