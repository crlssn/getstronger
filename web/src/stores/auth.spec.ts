// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/posthog', () => ({
  identifyUser: vi.fn(),
  resetUser: vi.fn(),
}))

import { identifyUser, resetUser } from '@/posthog'
import { selectAuthorised, useAuthStore } from './auth'

const identifyUserMock = vi.mocked(identifyUser)
const resetUserMock = vi.mocked(resetUser)

// An unsigned JWT whose payload carries the given userId claim.
const fakeToken = (userId: string) =>
  `header.${btoa(JSON.stringify({ userId })).replace(/=+$/, '')}.signature`

const authorised = () => selectAuthorised(useAuthStore.getState())

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ userId: '', accessToken: '', lastUserId: '' })
    identifyUserMock.mockReset()
    resetUserMock.mockReset()
  })

  test('decodes the user ID from the token and identifies on first login', () => {
    useAuthStore.getState().setAccessToken(fakeToken('user-1'))

    expect(useAuthStore.getState().userId).toBe('user-1')
    expect(authorised()).toBe(true)
    expect(identifyUserMock).toHaveBeenCalledExactlyOnceWith('user-1')
    expect(resetUserMock).not.toHaveBeenCalled()
  })

  test('does not re-identify when the same user refreshes their token', () => {
    useAuthStore.getState().setAccessToken(fakeToken('user-1'))
    identifyUserMock.mockReset()

    useAuthStore.getState().setAccessToken(fakeToken('user-1'))

    expect(identifyUserMock).not.toHaveBeenCalled()
    expect(resetUserMock).not.toHaveBeenCalled()
  })

  test('resets and re-identifies when a different user signs in', () => {
    useAuthStore.getState().setAccessToken(fakeToken('user-1'))
    identifyUserMock.mockReset()

    useAuthStore.getState().setAccessToken(fakeToken('user-2'))

    expect(useAuthStore.getState().userId).toBe('user-2')
    expect(resetUserMock).toHaveBeenCalledOnce()
    expect(identifyUserMock).toHaveBeenCalledExactlyOnceWith('user-2')
  })

  test('resets analytics identity on logout', () => {
    useAuthStore.getState().setAccessToken(fakeToken('user-1'))

    useAuthStore.getState().logout()

    expect(useAuthStore.getState().userId).toBe('')
    expect(useAuthStore.getState().accessToken).toBe('')
    expect(authorised()).toBe(false)
    expect(resetUserMock).toHaveBeenCalledOnce()
  })

  test('does not reset when logging out while already signed out', () => {
    useAuthStore.getState().logout()

    expect(resetUserMock).not.toHaveBeenCalled()
  })

  // The device keeps a signed-out athlete's drafts for their way back in, so
  // the next sign-in has to be able to tell them from a stranger. `userId` is
  // blank by then; this is what is left to compare against.
  test('remembers the account across the sign-out', () => {
    useAuthStore.getState().setAccessToken(fakeToken('user-1'))

    useAuthStore.getState().logout()

    expect(useAuthStore.getState().lastUserId).toBe('user-1')
  })

  test('persists the session so a reload stays signed in', () => {
    useAuthStore.getState().setAccessToken(fakeToken('user-1'))

    expect(JSON.parse(localStorage.getItem('auth') ?? '{}')).toMatchObject({
      state: { userId: 'user-1', lastUserId: 'user-1' },
    })
  })
})

describe('selectAuthorised', () => {
  test.each([
    [{ userId: 'user-1', accessToken: 'token' }, true],
    [{ userId: 'user-1', accessToken: '' }, false],
    [{ userId: '', accessToken: 'token' }, false],
    [{ userId: '', accessToken: '' }, false],
  ])('%o is authorised: %s', (state, expected) => {
    expect(selectAuthorised({ ...useAuthStore.getState(), ...state })).toBe(expected)
  })
})
