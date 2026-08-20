// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/posthog', () => ({
  identifyUser: vi.fn(),
  resetUser: vi.fn(),
}))

import { identifyUser, resetUser } from '@/posthog'
import { useAuthStore } from './auth'

const identifyUserMock = vi.mocked(identifyUser)
const resetUserMock = vi.mocked(resetUser)

// An unsigned JWT whose payload carries the given userId claim.
const fakeToken = (userId: string) =>
  `header.${btoa(JSON.stringify({ userId })).replace(/=+$/, '')}.signature`

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    identifyUserMock.mockReset()
    resetUserMock.mockReset()
  })

  test('decodes the user ID from the token and identifies on first login', () => {
    const store = useAuthStore()
    store.setAccessToken(fakeToken('user-1'))

    expect(store.userId).toBe('user-1')
    expect(store.authorised).toBe(true)
    expect(identifyUserMock).toHaveBeenCalledExactlyOnceWith('user-1')
    expect(resetUserMock).not.toHaveBeenCalled()
  })

  test('does not re-identify when the same user refreshes their token', () => {
    const store = useAuthStore()
    store.setAccessToken(fakeToken('user-1'))
    identifyUserMock.mockReset()

    store.setAccessToken(fakeToken('user-1'))

    expect(identifyUserMock).not.toHaveBeenCalled()
    expect(resetUserMock).not.toHaveBeenCalled()
  })

  test('resets and re-identifies when a different user signs in', () => {
    const store = useAuthStore()
    store.setAccessToken(fakeToken('user-1'))
    identifyUserMock.mockReset()

    store.setAccessToken(fakeToken('user-2'))

    expect(store.userId).toBe('user-2')
    expect(resetUserMock).toHaveBeenCalledOnce()
    expect(identifyUserMock).toHaveBeenCalledExactlyOnceWith('user-2')
  })

  test('resets analytics identity on logout', () => {
    const store = useAuthStore()
    store.setAccessToken(fakeToken('user-1'))

    store.logout()

    expect(store.userId).toBe('')
    expect(store.accessToken).toBe('')
    expect(store.authorised).toBe(false)
    expect(resetUserMock).toHaveBeenCalledOnce()
  })

  test('does not reset when logging out while already signed out', () => {
    useAuthStore().logout()

    expect(resetUserMock).not.toHaveBeenCalled()
  })
})
