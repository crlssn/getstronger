// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests.ts', () => ({
  refreshToken: vi.fn(),
}))

import { refreshToken } from '@/http/requests.ts'
import { useAuthStore } from '@/stores/auth'
import { refreshAccessTokenOrLogout } from './jwt'

const refreshTokenMock = vi.mocked(refreshToken)

// setAccessToken decodes every token, so stubs must be shaped like real JWTs.
const fakeToken = (userId: string) =>
  `header.${btoa(JSON.stringify({ userId })).replace(/=+$/, '')}.signature`

describe('refreshAccessTokenOrLogout', () => {
  beforeEach(() => {
    useAuthStore.setState({ userId: '', accessToken: '' })
    refreshTokenMock.mockReset()
  })

  test('shares one request between concurrent callers', async () => {
    let release: (value: { accessToken: string }) => void = () => {}
    refreshTokenMock.mockReturnValue(
      new Promise((resolve) => {
        release = resolve
      }) as never,
    )

    const first = refreshAccessTokenOrLogout()
    const second = refreshAccessTokenOrLogout()
    expect(refreshTokenMock).toHaveBeenCalledTimes(1)

    const freshToken = fakeToken('user-1')
    release({ accessToken: freshToken })
    await Promise.all([first, second])

    expect(refreshTokenMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().accessToken).toBe(freshToken)
  })

  test('starts a new request once the previous one has settled', async () => {
    refreshTokenMock.mockResolvedValue({ accessToken: fakeToken('user-1') } as never)
    await refreshAccessTokenOrLogout()

    const secondToken = fakeToken('user-1')
    refreshTokenMock.mockResolvedValue({ accessToken: secondToken } as never)
    await refreshAccessTokenOrLogout()

    expect(refreshTokenMock).toHaveBeenCalledTimes(2)
    expect(useAuthStore.getState().accessToken).toBe(secondToken)
  })

  test('releases the shared request when it fails', async () => {
    refreshTokenMock.mockRejectedValueOnce(new Error('network down'))
    await expect(refreshAccessTokenOrLogout()).rejects.toThrow('network down')

    const recoveredToken = fakeToken('user-1')
    refreshTokenMock.mockResolvedValue({ accessToken: recoveredToken } as never)
    await refreshAccessTokenOrLogout()

    expect(useAuthStore.getState().accessToken).toBe(recoveredToken)
  })
})
