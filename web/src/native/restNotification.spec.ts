// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
  native: false,
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => bridge.native },
}))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: bridge.checkPermissions,
    requestPermissions: bridge.requestPermissions,
    schedule: bridge.schedule,
    cancel: bridge.cancel,
  },
}))

import { cancelRestOver, restNotificationId, scheduleRestOver } from './restNotification'

const rest = { routineID: 'routine-1', planID: 'plan-1' }

const settled = async () => {
  await vi.waitFor(() => expect(bridge.checkPermissions).toHaveBeenCalled())
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('rest notifications', () => {
  beforeEach(() => {
    bridge.native = true
    bridge.checkPermissions.mockReset().mockResolvedValue({ display: 'granted' })
    bridge.requestPermissions.mockReset().mockResolvedValue({ display: 'granted' })
    bridge.schedule.mockReset().mockResolvedValue({ notifications: [] })
    bridge.cancel.mockReset().mockResolvedValue(undefined)
  })

  test('schedules one notification for the rest deadline', async () => {
    const endsAt = Date.now() + 120_000
    scheduleRestOver(endsAt, rest)

    await vi.waitFor(() => expect(bridge.schedule).toHaveBeenCalledTimes(1))
    expect(bridge.schedule).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          id: restNotificationId,
          schedule: { at: new Date(endsAt) },
          extra: rest,
        }),
      ],
    })
  })

  // The prompt belongs at the moment a rest timer is first started, where the
  // reason for it is on screen, rather than at launch.
  test('asks for permission the first time a rest is scheduled', async () => {
    bridge.checkPermissions.mockResolvedValue({ display: 'prompt' })

    scheduleRestOver(Date.now() + 60_000, rest)
    await vi.waitFor(() => expect(bridge.requestPermissions).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(bridge.schedule).toHaveBeenCalledTimes(1))
  })

  test('schedules nothing once the permission is denied', async () => {
    bridge.checkPermissions.mockResolvedValue({ display: 'denied' })

    scheduleRestOver(Date.now() + 60_000, rest)
    await settled()

    expect(bridge.requestPermissions).not.toHaveBeenCalled()
    expect(bridge.schedule).not.toHaveBeenCalled()
  })

  test('cancels the pending notification', async () => {
    cancelRestOver()

    await vi.waitFor(() =>
      expect(bridge.cancel).toHaveBeenCalledWith({
        notifications: [{ id: restNotificationId }],
      }),
    )
  })

  // One id, so a rest that is extended replaces the notification on the phone
  // rather than leaving a second one behind it.
  test('replaces the pending notification rather than stacking one', async () => {
    scheduleRestOver(Date.now() + 60_000, rest)
    scheduleRestOver(Date.now() + 90_000, rest)

    await vi.waitFor(() => expect(bridge.schedule).toHaveBeenCalledTimes(2))
    const ids = bridge.schedule.mock.calls.map(([options]) => options.notifications[0].id)
    expect(new Set(ids)).toEqual(new Set([restNotificationId]))
  })

  // Scheduling and cancelling are both asynchronous, so a cancel that overtook
  // the schedule it was meant to undo would leave a notification to fire for a
  // rest that is over.
  test('cancels a rest that ends while its own scheduling is still in flight', async () => {
    let release = () => {}
    bridge.schedule.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ notifications: [] })
        }),
    )

    scheduleRestOver(Date.now() + 60_000, rest)
    await vi.waitFor(() => expect(bridge.schedule).toHaveBeenCalledTimes(1))

    cancelRestOver()
    expect(bridge.cancel).not.toHaveBeenCalled()

    release()
    await vi.waitFor(() => expect(bridge.cancel).toHaveBeenCalledTimes(1))
  })

  test('leaves a rest whose deadline has already passed alone', async () => {
    scheduleRestOver(Date.now() - 1_000, rest)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(bridge.schedule).not.toHaveBeenCalled()
  })

  test('leaves the browser alone', async () => {
    bridge.native = false

    scheduleRestOver(Date.now() + 60_000, rest)
    cancelRestOver()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(bridge.checkPermissions).not.toHaveBeenCalled()
    expect(bridge.schedule).not.toHaveBeenCalled()
    expect(bridge.cancel).not.toHaveBeenCalled()
  })

  test('carries on when the plugin refuses', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    bridge.schedule.mockRejectedValue(new Error('no notifications'))

    scheduleRestOver(Date.now() + 60_000, rest)

    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    warn.mockRestore()
  })
})
