// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/http/requests.ts', () => ({
  refreshToken: vi.fn(),
}))

import { refreshToken } from '@/http/requests.ts'
import { useAuthStore } from '@/stores/auth'
import { refreshAccessTokenOrLogout } from './jwt'

const refreshTokenMock = vi.mocked(refreshToken)

describe('refreshAccessTokenOrLogout', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    refreshTokenMock.mockReset()

    // A non-empty user ID keeps setAccessToken from decoding the stub token.
    useAuthStore().userId = 'user-1'
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

    release({ accessToken: 'fresh-token' })
    await Promise.all([first, second])

    expect(refreshTokenMock).toHaveBeenCalledTimes(1)
    expect(useAuthStore().accessToken).toBe('fresh-token')
  })

  test('starts a new request once the previous one has settled', async () => {
    refreshTokenMock.mockResolvedValue({ accessToken: 'first-token' } as never)
    await refreshAccessTokenOrLogout()

    refreshTokenMock.mockResolvedValue({ accessToken: 'second-token' } as never)
    await refreshAccessTokenOrLogout()

    expect(refreshTokenMock).toHaveBeenCalledTimes(2)
    expect(useAuthStore().accessToken).toBe('second-token')
  })

  test('releases the shared request when it fails', async () => {
    refreshTokenMock.mockRejectedValueOnce(new Error('network down'))
    await expect(refreshAccessTokenOrLogout()).rejects.toThrow('network down')

    refreshTokenMock.mockResolvedValue({ accessToken: 'recovered-token' } as never)
    await refreshAccessTokenOrLogout()

    expect(useAuthStore().accessToken).toBe('recovered-token')
  })
})
