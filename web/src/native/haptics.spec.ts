// @vitest-environment jsdom

import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
  native: false,
  impact: vi.fn(),
  notification: vi.fn(),
  selectionChanged: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => bridge.native },
}))

vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: bridge.impact,
    notification: bridge.notification,
    selectionChanged: bridge.selectionChanged,
  },
  ImpactStyle: { Heavy: 'HEAVY', Medium: 'MEDIUM', Light: 'LIGHT' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' },
}))

import { haptic, vibrateRestOver } from './haptics'

// Only Date is faked, so the module's clock can be moved while the real
// microtask queue keeps running and `vi.waitFor` still resolves.
vi.useFakeTimers({ toFake: ['Date'] })
let now = Date.parse('2026-09-15T09:00:00Z')

beforeEach(() => {
  // Every test starts well clear of the last one's coalescing window.
  now += 10_000
  vi.setSystemTime(now)

  bridge.native = true
  bridge.impact.mockReset().mockResolvedValue(undefined)
  bridge.notification.mockReset().mockResolvedValue(undefined)
  bridge.selectionChanged.mockReset().mockResolvedValue(undefined)
})

afterAll(() => {
  vi.useRealTimers()
})

describe('haptic', () => {
  test('answers a press with the lightest impact', async () => {
    haptic('press')

    await vi.waitFor(() => expect(bridge.impact).toHaveBeenCalledWith({ style: 'LIGHT' }))
  })

  // A set is the app's most repeated action and the one a hand feels for
  // without looking, so it lands heavier than the tap that opened a menu.
  test('answers a completed set with a medium impact', async () => {
    haptic('setCompleted')

    await vi.waitFor(() => expect(bridge.impact).toHaveBeenCalledWith({ style: 'MEDIUM' }))
  })

  test('answers a choice with the selection tick', async () => {
    haptic('selection')

    await vi.waitFor(() => expect(bridge.selectionChanged).toHaveBeenCalledTimes(1))
  })

  test('answers a personal best with the success pattern', async () => {
    haptic('personalBest')

    await vi.waitFor(() => expect(bridge.notification).toHaveBeenCalledWith({ type: 'SUCCESS' }))
  })

  test('answers a failed action with the error pattern', async () => {
    haptic('actionFailed')

    await vi.waitFor(() => expect(bridge.notification).toHaveBeenCalledWith({ type: 'ERROR' }))
  })

  test('leaves the browser alone', async () => {
    bridge.native = false

    haptic('press')
    await Promise.resolve()

    expect(bridge.impact).not.toHaveBeenCalled()
  })

  test('carries on when the plugin refuses', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    bridge.impact.mockRejectedValue(new Error('no haptics'))

    haptic('press')

    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    warn.mockRestore()
  })

  // Two buzzes a thumb cannot tell apart are one sensation, and the second is
  // only a queue forming behind the first.
  test('coalesces gestures that arrive together', async () => {
    haptic('press')
    haptic('press')
    haptic('selection')

    await vi.waitFor(() => expect(bridge.impact).toHaveBeenCalledTimes(1))
    expect(bridge.selectionChanged).not.toHaveBeenCalled()
  })

  test('lets a deliberate second tap through', async () => {
    haptic('press')
    await vi.waitFor(() => expect(bridge.impact).toHaveBeenCalledTimes(1))

    vi.setSystemTime((now += 200))
    haptic('press')

    await vi.waitFor(() => expect(bridge.impact).toHaveBeenCalledTimes(2))
  })

  // An announcement is rare, already deduped by whoever raises it, and is the
  // one the athlete is waiting for — the tap that happened to precede it must
  // not swallow it.
  test('never coalesces an announcement behind a press', async () => {
    haptic('press')
    haptic('actionFailed')

    await vi.waitFor(() => expect(bridge.notification).toHaveBeenCalledWith({ type: 'ERROR' }))
  })
})

describe('vibrateRestOver', () => {
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
