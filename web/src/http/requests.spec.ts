import { beforeEach, describe, expect, it, vi } from 'vitest'

const { markNotificationsAsRead } = vi.hoisted(() => ({ markNotificationsAsRead: vi.fn() }))

vi.mock('./clients', () => ({
  authClient: {},
  exerciseClient: {},
  feedClient: {},
  notificationClient: { markNotificationsAsRead },
  routineClient: {},
  userClient: {},
  workoutClient: {},
}))

import { markNotificationAsRead } from './requests'

describe('markNotificationAsRead', () => {
  beforeEach(() => {
    markNotificationsAsRead.mockReset()
    markNotificationsAsRead.mockResolvedValue({})
  })

  it('sends a notification ID when marking one notification', async () => {
    const notificationId = 'c772e4cd-4b23-44df-bddd-22c96a444055'

    await markNotificationAsRead(notificationId)

    expect(markNotificationsAsRead).toHaveBeenCalledWith(
      expect.objectContaining({ notificationId }),
    )
  })

  it('omits the notification ID when marking every notification', async () => {
    await markNotificationAsRead()

    expect(markNotificationsAsRead).toHaveBeenCalledWith(
      expect.not.objectContaining({ notificationId: expect.anything() }),
    )
  })

  it('suppresses failures for best-effort item updates', async () => {
    markNotificationsAsRead.mockRejectedValue(new Error('network unavailable'))

    await expect(
      markNotificationAsRead('c772e4cd-4b23-44df-bddd-22c96a444055', true),
    ).resolves.toBe(undefined)
  })
})
