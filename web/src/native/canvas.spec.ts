// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ platform: 'ios', setTheme: vi.fn() }))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => bridge.platform,
    isNativePlatform: () => bridge.platform !== 'web',
  },
  registerPlugin: () => ({ setTheme: bridge.setTheme }),
}))

import { paintCanvas } from './canvas'

describe('paintCanvas', () => {
  beforeEach(() => {
    bridge.platform = 'ios'
    bridge.setTheme.mockReset().mockResolvedValue(undefined)
  })

  test('hands the palette to the WebView the page is peeled off', async () => {
    paintCanvas('dark')
    await vi.waitFor(() => expect(bridge.setTheme).toHaveBeenCalledWith({ theme: 'dark' }))

    paintCanvas('light')
    await vi.waitFor(() => expect(bridge.setTheme).toHaveBeenCalledWith({ theme: 'light' }))
  })

  test('hands it to Android too, for the strips the system bars sit on', async () => {
    bridge.platform = 'android'

    paintCanvas('dark')

    await vi.waitFor(() => expect(bridge.setTheme).toHaveBeenCalledWith({ theme: 'dark' }))
  })

  // A browser paints its own window, and there is nothing behind the page for
  // the app to get wrong.
  test('leaves the browser alone', async () => {
    bridge.platform = 'web'

    paintCanvas('dark')
    await Promise.resolve()

    expect(bridge.setTheme).not.toHaveBeenCalled()
  })

  test('carries on when the plugin refuses', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    bridge.setTheme.mockRejectedValue(new Error('no canvas'))

    paintCanvas('light')

    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    warn.mockRestore()
  })
})
