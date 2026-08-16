// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'

const { login, markNotificationsAsRead, push, resendVerificationEmail } = vi.hoisted(() => ({
  login: vi.fn(),
  markNotificationsAsRead: vi.fn(),
  push: vi.fn(),
  resendVerificationEmail: vi.fn(),
}))

vi.mock('./clients', () => ({
  authClient: { login, resendVerificationEmail },
  exerciseClient: {},
  feedClient: {},
  notificationClient: { markNotificationsAsRead },
  routineClient: {},
  userClient: {},
  workoutClient: {},
}))

vi.mock('@/router/router', () => ({
  default: { currentRoute: { value: { name: 'login' } }, push },
}))

import { Error as ApiError, ErrorDetailSchema } from '@/proto/api/v1/errors_pb'
import { useEmailVerificationStore } from '@/stores/emailVerification'
import {
  login as logIn,
  markNotificationAsRead,
  resendVerificationEmail as resend,
} from './requests'

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
    setActivePinia(createPinia())
    login.mockReset()
    push.mockReset()
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

    expect(push).toHaveBeenCalledWith({ name: 'verify-email-pending' })
    expect(useEmailVerificationStore().pendingEmail).toBe('alex.morgan@example.com')
  })

  it('leaves other failures to the generic error handling', async () => {
    login.mockRejectedValue(new ConnectError('invalid credentials', Code.InvalidArgument))
    vi.stubGlobal('alert', vi.fn())

    await logIn('alex.morgan@example.com', 'wrong')

    expect(push).not.toHaveBeenCalled()
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
