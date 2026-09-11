// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ platform: 'ios', setTheme: vi.fn() }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => bridge.platform },
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

  // The gesture is WKWebView's; Android and the browser paint nothing behind
  // the page for the app to get wrong.
  test('leaves every other platform alone', async () => {
    for (const platform of ['android', 'web']) {
      bridge.platform = platform

      paintCanvas('dark')
      await Promise.resolve()

      expect(bridge.setTheme).not.toHaveBeenCalled()
    }
  })

  test('carries on when the plugin refuses', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    bridge.setTheme.mockRejectedValue(new Error('no canvas'))

    paintCanvas('light')

    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    warn.mockRestore()
  })
})
