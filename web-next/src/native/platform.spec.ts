// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
  native: false,
  addListener: vi.fn(),
  minimizeApp: vi.fn(),
  hideSplash: vi.fn(),
  keepAwake: vi.fn(),
  allowSleep: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => bridge.native },
}))

vi.mock('@capacitor/app', () => ({
  App: { addListener: bridge.addListener, minimizeApp: bridge.minimizeApp },
}))

vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: bridge.hideSplash } }))

vi.mock('@capacitor-community/keep-awake', () => ({
  KeepAwake: { keepAwake: bridge.keepAwake, allowSleep: bridge.allowSleep },
}))

import { deepLinkPath, initNativePlatform, type NativeRouter } from './platform'

type Listener = (state: { location: { pathname: string } }) => void

const routerAt = (pathname: string) => {
  const listeners: Listener[] = []

  const router: NativeRouter = {
    state: { location: { pathname } },
    subscribe: (listener) => {
      listeners.push(listener)
      return () => listeners.splice(listeners.indexOf(listener), 1)
    },
    navigate: vi.fn(),
  }

  return { router, go: (to: string) => listeners.forEach((l) => l({ location: { pathname: to } })) }
}

const handlerFor = (event: string) =>
  bridge.addListener.mock.calls.find(([name]) => name === event)?.[1] as
    ((payload: never) => void) | undefined

describe('deepLinkPath', () => {
  test('maps universal links onto the SPA path', () => {
    expect(deepLinkPath('https://www.getstronger.studio/verify-email?token=abc')).toBe(
      '/verify-email?token=abc',
    )
  })

  test('keeps the query and hash of a password-reset link', () => {
    expect(deepLinkPath('https://www.getstronger.studio/reset-password?token=t#top')).toBe(
      '/reset-password?token=t#top',
    )
  })

  // The custom scheme has no authority part, so the URL parser reads the first
  // path segment as the host.
  test('reads the first segment of a custom-scheme link as the path', () => {
    expect(deepLinkPath('getstronger://verify-email?token=abc')).toBe('/verify-email?token=abc')
    expect(deepLinkPath('getstronger://users/123')).toBe('/users/123')
  })

  test('returns nothing for garbage', () => {
    expect(deepLinkPath('not a url')).toBeUndefined()
  })
})

describe('initNativePlatform', () => {
  beforeEach(() => {
    bridge.native = true
    bridge.addListener.mockReset().mockResolvedValue({ remove: vi.fn() })
    bridge.minimizeApp.mockReset().mockResolvedValue(undefined)
    bridge.hideSplash.mockReset().mockResolvedValue(undefined)
    bridge.keepAwake.mockReset().mockResolvedValue(undefined)
    bridge.allowSleep.mockReset().mockResolvedValue(undefined)
  })

  // In a browser there is no native shell to wire up, and the Capacitor plugin
  // modules must never be imported: they assume a bridge that is not there.
  test('does nothing outside the native shell', async () => {
    bridge.native = false
    const { router } = routerAt('/home')

    await initNativePlatform(router)

    expect(bridge.addListener).not.toHaveBeenCalled()
    expect(bridge.hideSplash).not.toHaveBeenCalled()
  })

  // Between sets the phone lies idle on a bench with the workout screen open,
  // which is exactly when the OS would dim and lock it.
  test('keeps the screen awake for as long as a workout is on it', async () => {
    const { router, go } = routerAt('/workouts/routine/routine-1')

    await initNativePlatform(router)
    expect(bridge.keepAwake).toHaveBeenCalledTimes(1)

    go('/home')
    expect(bridge.allowSleep).toHaveBeenCalledTimes(1)
  })

  test('asks again only when the answer changes', async () => {
    const { router, go } = routerAt('/home')

    await initNativePlatform(router)
    expect(bridge.allowSleep).toHaveBeenCalledTimes(1)

    go('/progress')
    go('/exercises')

    expect(bridge.allowSleep).toHaveBeenCalledTimes(1)
    expect(bridge.keepAwake).not.toHaveBeenCalled()
  })

  test('survives a device that cannot stay awake', async () => {
    bridge.keepAwake.mockRejectedValue(new Error('unsupported'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { router } = routerAt('/workouts/quick')

    await expect(initNativePlatform(router)).resolves.toBeUndefined()
  })

  // Android's hardware back button has no default behaviour once a listener
  // exists, so it has to mirror the browser by hand.
  test('walks back through history, and hands over to the OS at the root', async () => {
    const { router } = routerAt('/home')
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    await initNativePlatform(router)
    const onBack = handlerFor('backButton')

    onBack?.({ canGoBack: true } as never)
    expect(back).toHaveBeenCalled()
    expect(bridge.minimizeApp).not.toHaveBeenCalled()

    onBack?.({ canGoBack: false } as never)
    expect(bridge.minimizeApp).toHaveBeenCalled()
  })

  test('opens a deep link on the screen it names', async () => {
    const { router } = routerAt('/home')

    await initNativePlatform(router)
    handlerFor('appUrlOpen')?.({ url: 'getstronger://verify-email?token=abc' } as never)

    expect(router.navigate).toHaveBeenCalledWith('/verify-email?token=abc')
  })

  test('ignores a deep link that is not a URL', async () => {
    const { router } = routerAt('/home')

    await initNativePlatform(router)
    handlerFor('appUrlOpen')?.({ url: 'nonsense' } as never)

    expect(router.navigate).not.toHaveBeenCalled()
  })

  // launchAutoHide is off, so the splash stays up until the app has mounted and
  // the user never sees an empty WebView.
  test('takes the splash screen down last', async () => {
    const { router } = routerAt('/home')

    await initNativePlatform(router)

    expect(bridge.hideSplash).toHaveBeenCalledTimes(1)
  })
})
