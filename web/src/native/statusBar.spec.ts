// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ native: false, setStyle: vi.fn() }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => bridge.native },
}))

vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setStyle: bridge.setStyle },
  Style: { Dark: 'DARK', Light: 'LIGHT' },
}))

import { paintStatusBar } from './statusBar'

describe('paintStatusBar', () => {
  beforeEach(() => {
    bridge.native = true
    bridge.setStyle.mockReset().mockResolvedValue(undefined)
  })

  // Capacitor names a style after the background it is meant for, so the app's
  // dark palette asks for Dark and gets the light clock that reads on it.
  test('turns the clock with the palette', async () => {
    paintStatusBar('dark')
    await vi.waitFor(() => expect(bridge.setStyle).toHaveBeenCalledWith({ style: 'DARK' }))

    paintStatusBar('light')
    await vi.waitFor(() => expect(bridge.setStyle).toHaveBeenCalledWith({ style: 'LIGHT' }))
  })

  test('leaves the browser alone, where the page owns the whole window', async () => {
    bridge.native = false

    paintStatusBar('dark')
    await Promise.resolve()

    expect(bridge.setStyle).not.toHaveBeenCalled()
  })

  test('carries on when the plugin refuses', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    bridge.setStyle.mockRejectedValue(new Error('no status bar'))

    paintStatusBar('light')

    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    warn.mockRestore()
  })
})
