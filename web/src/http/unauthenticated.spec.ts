// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/posthog', () => ({ identifyUser: vi.fn(), resetUser: vi.fn() }))

import { WeightUnit } from '@/proto/api/v1/shared_pb'
import { setNavigator, type Navigate } from '@/router/navigation'
import { useAuthStore } from '@/stores/auth'
import { usePreferencesStore } from '@/stores/preferences'
import { loginPath, logoutUnauthenticatedUser } from './unauthenticated'

const realLocation = Object.getOwnPropertyDescriptor(window, 'location')

const atPath = (pathname: string) => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname, replace: vi.fn(), assign: vi.fn() },
  })
}

const signedIn = () => {
  useAuthStore.setState({ userId: 'user-1', accessToken: 'token', lastUserId: '' })
  usePreferencesStore.setState({ weightUnit: WeightUnit.POUNDS })
}

describe('logoutUnauthenticatedUser', () => {
  let navigate: ReturnType<typeof vi.fn<Navigate>>

  beforeEach(() => {
    localStorage.clear()
    navigate = vi.fn<Navigate>()
    setNavigator(navigate)
    atPath('/home')
    signedIn()
  })

  afterEach(() => {
    setNavigator(undefined)
    if (realLocation) Object.defineProperty(window, 'location', realLocation)
    vi.restoreAllMocks()
  })

  test('clears the session and sends the user to login', async () => {
    await logoutUnauthenticatedUser()

    expect(useAuthStore.getState().accessToken).toBe('')
    expect(navigate).toHaveBeenCalledExactlyOnceWith(loginPath, { replace: true })
  })

  // The units belong to the account that just went away, not to the device.
  test('drops the previous account unit preferences', async () => {
    await logoutUnauthenticatedUser()

    expect(usePreferencesStore.getState().weightUnit).toBe(WeightUnit.KILOGRAMS)
  })

  test('does not navigate when already on the login screen', async () => {
    atPath(loginPath)

    await logoutUnauthenticatedUser()

    expect(useAuthStore.getState().accessToken).toBe('')
    expect(navigate).not.toHaveBeenCalled()
  })

  // An expired session fails every in-flight request at once, and each failure
  // calls this.
  test('redirects once for concurrent callers', async () => {
    let release: () => void = () => {}
    navigate.mockImplementation(() => new Promise<void>((resolve) => (release = resolve)))

    const redirects = [logoutUnauthenticatedUser(), logoutUnauthenticatedUser()]
    release()
    await Promise.all(redirects)

    expect(navigate).toHaveBeenCalledOnce()
  })

  test('redirects again for a later session expiry', async () => {
    await logoutUnauthenticatedUser()
    signedIn()

    await logoutUnauthenticatedUser()

    expect(navigate).toHaveBeenCalledTimes(2)
  })
})
