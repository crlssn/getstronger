// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { Code, ConnectError } from '@connectrpc/connect'

vi.mock('@/jwt/jwt', () => ({
  refreshAccessTokenOrLogout: vi.fn(),
}))

import * as jwt from '@/jwt/jwt'
import { AuthService } from '@/proto/api/v1/auth_service_pb'
import { UserService } from '@/proto/api/v1/user_service_pb'
import { useAuthStore } from '@/stores/auth'
import { retryUnauthenticated } from './interceptors'

const refreshAccessTokenOrLogout = vi.mocked(jwt.refreshAccessTokenOrLogout)

const expired = () => new ConnectError('token expired', Code.Unauthenticated)

const run = (
  req: { stream: boolean; method: unknown },
  next: (req: unknown) => Promise<unknown>,
): Promise<unknown> => retryUnauthenticated(next as never)(req as never) as Promise<unknown>

const unaryRequest = { stream: false, method: UserService.method.getUser }

describe('retryUnauthenticated', () => {
  beforeEach(() => {
    refreshAccessTokenOrLogout.mockReset()
    refreshAccessTokenOrLogout.mockResolvedValue(undefined)

    useAuthStore.setState({ userId: 'user-1', accessToken: 'expired-token' })
  })

  test('refreshes the access token and replays the call once', async () => {
    const next = vi.fn().mockRejectedValueOnce(expired()).mockResolvedValueOnce({ message: 'ok' })

    await expect(run(unaryRequest, next)).resolves.toEqual({ message: 'ok' })
    expect(refreshAccessTokenOrLogout).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledTimes(2)
  })

  test('gives up when the refresh could not restore the session', async () => {
    refreshAccessTokenOrLogout.mockImplementation(async () => {
      useAuthStore.getState().logout()
    })
    const next = vi.fn().mockRejectedValue(expired())

    await expect(run(unaryRequest, next)).rejects.toThrow(ConnectError)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('does not refresh on the refresh token call itself', async () => {
    const next = vi.fn().mockRejectedValue(expired())
    const req = { stream: false, method: AuthService.method.refreshToken }

    await expect(run(req, next)).rejects.toThrow(ConnectError)
    expect(refreshAccessTokenOrLogout).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('leaves streaming calls to recover at the call site', async () => {
    const next = vi.fn().mockRejectedValue(expired())
    const req = { stream: true, method: UserService.method.getUser }

    await expect(run(req, next)).rejects.toThrow(ConnectError)
    expect(refreshAccessTokenOrLogout).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('skips the retry when nobody is signed in', async () => {
    useAuthStore.getState().logout()
    const next = vi.fn().mockRejectedValue(expired())

    await expect(run(unaryRequest, next)).rejects.toThrow(ConnectError)
    expect(refreshAccessTokenOrLogout).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('passes other errors through untouched', async () => {
    const next = vi.fn().mockRejectedValue(new ConnectError('boom', Code.Internal))

    await expect(run(unaryRequest, next)).rejects.toThrow('boom')
    expect(refreshAccessTokenOrLogout).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })
})
