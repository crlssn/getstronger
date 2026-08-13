import { ref } from 'vue'
import { defineStore } from 'pinia'
import { create } from '@bufbuild/protobuf'
import { notificationClient } from '@/http/clients.ts'
import { UnreadNotificationsRequestSchema } from '@/proto/api/v1/notification_service_pb.ts'
import { Code, ConnectError } from '@connectrpc/connect'
import { logoutUnauthenticatedUser } from '@/http/unauthenticated'

export const useNotificationStore = defineStore('notifications', () => {
  const unreadCount = ref(0)

  let streamingEnabled = false
  let streamController: AbortController | undefined

  const waitBeforeRetry = (signal: AbortSignal): Promise<void> => {
    if (signal.aborted) return Promise.resolve()

    return new Promise((resolve) => {
      const onAbort = () => {
        clearTimeout(timeout)
        resolve()
      }
      const timeout = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, 5000)

      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  const runUnreadNotificationStream = async (controller: AbortController) => {
    const req = create(UnreadNotificationsRequestSchema, {})

    while (!controller.signal.aborted) {
      try {
        const stream = notificationClient.unreadNotifications(req, {
          signal: controller.signal,
        })
        for await (const message of stream) {
          unreadCount.value = Number(message.count)
        }
      } catch (error) {
        if (controller.signal.aborted) return

        if (error instanceof ConnectError && error.code === Code.Unauthenticated) {
          streamingEnabled = false
          unreadCount.value = 0
          await logoutUnauthenticatedUser()
          return
        }

        console.warn('Stream disconnected, retrying...', error)
      }

      await waitBeforeRetry(controller.signal)
    }
  }

  const startStreamIfVisible = () => {
    if (!streamingEnabled || streamController) return
    if (typeof document !== 'undefined' && document.hidden) return

    const controller = new AbortController()
    streamController = controller
    void runUnreadNotificationStream(controller).finally(() => {
      if (streamController === controller) streamController = undefined
    })
  }

  const pauseUnreadNotificationStream = () => {
    streamController?.abort()
    streamController = undefined
  }

  const streamUnreadNotifications = () => {
    streamingEnabled = true
    startStreamIfVisible()
  }

  const stopUnreadNotifications = () => {
    streamingEnabled = false
    pauseUnreadNotificationStream()
    unreadCount.value = 0
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        pauseUnreadNotificationStream()
        return
      }

      startStreamIfVisible()
    })
  }

  return { stopUnreadNotifications, streamUnreadNotifications, unreadCount }
})
