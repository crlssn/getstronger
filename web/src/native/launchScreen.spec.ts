// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ native: true, hide: vi.fn() }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => bridge.native },
}))

vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: bridge.hide } }))

import { handOverLaunchScreen, hideLaunchScreen } from './launchScreen'

// The event the splash fires when its fade-in has finished, and one from the
// plates turning on the bar, which never means the splash is up. jsdom has no
// AnimationEvent, so the name is hung on a plain one.
const animationEnd = (animationName: string) =>
  document
    .getElementById('boot-splash')
    ?.dispatchEvent(Object.assign(new Event('animationend', { bubbles: true }), { animationName }))

describe('launch screen', () => {
  beforeEach(() => {
    bridge.native = true
    bridge.hide.mockReset()
    document.body.innerHTML = '<div id="boot-splash"></div>'
  })

  test('holds the launch screen until the boot splash has faded in', async () => {
    handOverLaunchScreen()
    expect(bridge.hide).not.toHaveBeenCalled()

    animationEnd('boot-reveal')

    await vi.waitFor(() => expect(bridge.hide).toHaveBeenCalledOnce())
  })

  // The plates and the slogan run on the same element and end their own
  // animations; only the reveal says the splash is on screen.
  test('ignores an animation that is not the reveal', () => {
    handOverLaunchScreen()
    animationEnd('load-l1')

    expect(bridge.hide).not.toHaveBeenCalled()
  })

  // Nothing may outlast the launch screen: without a splash to wait for there
  // is nothing to hand over to either.
  test('takes the launch screen down when there is no splash to wait for', async () => {
    document.body.innerHTML = ''
    handOverLaunchScreen()

    await vi.waitFor(() => expect(bridge.hide).toHaveBeenCalledOnce())
  })

  // A boot that beats the reveal removes the splash mid-fade, and the event
  // never arrives.
  test('takes the launch screen down when the app beats the reveal', async () => {
    handOverLaunchScreen()
    hideLaunchScreen()

    await vi.waitFor(() => expect(bridge.hide).toHaveBeenCalledOnce())
  })

  test('does nothing in a browser', () => {
    bridge.native = false

    handOverLaunchScreen()
    animationEnd('boot-reveal')
    hideLaunchScreen()

    expect(bridge.hide).not.toHaveBeenCalled()
  })
})
