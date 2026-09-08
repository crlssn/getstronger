// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ native: false, notification: vi.fn() }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => bridge.native },
}))

vi.mock('@capacitor/haptics', () => ({
  Haptics: { notification: bridge.notification },
  NotificationType: { Success: 'SUCCESS' },
}))

import { vibrateRestOver } from './haptics'

describe('vibrateRestOver', () => {
  beforeEach(() => {
    bridge.native = true
    bridge.notification.mockReset().mockResolvedValue(undefined)
  })

  // The OS success pattern is a two-beat that reads as an announcement, where
  // a single impact reads as a tap being acknowledged.
  test('buzzes the success pattern when a rest runs out', async () => {
    vibrateRestOver(1_000)

    await vi.waitFor(() => expect(bridge.notification).toHaveBeenCalledWith({ type: 'SUCCESS' }))
  })

  // Two screens watch the same rest, and both can see it run out in the same
  // tick; the deadline says whether the phone has already spoken for it.
  test('buzzes once per rest, whoever asks', async () => {
    vibrateRestOver(2_000)
    vibrateRestOver(2_000)
    await vi.waitFor(() => expect(bridge.notification).toHaveBeenCalledTimes(1))

    vibrateRestOver(3_000)
    await vi.waitFor(() => expect(bridge.notification).toHaveBeenCalledTimes(2))
  })

  test('leaves the browser alone', async () => {
    bridge.native = false

    vibrateRestOver(4_000)
    await Promise.resolve()

    expect(bridge.notification).not.toHaveBeenCalled()
  })

  test('carries on when the plugin refuses', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    bridge.notification.mockRejectedValue(new Error('no haptics'))

    vibrateRestOver(5_000)

    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    warn.mockRestore()
  })
})
