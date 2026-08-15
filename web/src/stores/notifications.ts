import { ref } from 'vue'
import { defineStore } from 'pinia'
import { create } from '@bufbuild/protobuf'
import { notificationClient } from '@/http/clients.ts'
import {
  GetUnreadNotificationCountRequestSchema,
  UnreadNotificationsRequestSchema,
} from '@/proto/api/v1/notification_service_pb.ts'
import { Code, ConnectError } from '@connectrpc/connect'
import { logoutUnauthenticatedUser } from '@/http/unauthenticated'

const reconciliationIntervalMs = 10 * 60 * 1000

export const useNotificationStore = defineStore('notifications', () => {
  const unreadCount = ref(0)

  let streamingEnabled = false
  let streamController: AbortController | undefined
  let reconciliationTimer: ReturnType<typeof setInterval> | undefined

  const countReq = create(GetUnreadNotificationCountRequestSchema, {})

  const clearReconciliationTimer = () => {
    if (reconciliationTimer) clearInterval(reconciliationTimer)
    reconciliationTimer = undefined
  }

  const pauseUnreadNotificationStream = () => {
    streamController?.abort()
    streamController = undefined
    clearReconciliationTimer()
  }

  const refreshUnreadNotifications = async (signal?: AbortSignal) => {
    try {
      const snapshot = await notificationClient.getUnreadNotificationCount(countReq, { signal })
      unreadCount.value = Number(snapshot.count)
    } catch (error) {
      if (signal?.aborted) return

      if (error instanceof ConnectError && error.code === Code.Unauthenticated) {
        streamingEnabled = false
        pauseUnreadNotificationStream()
        unreadCount.value = 0
        await logoutUnauthenticatedUser()
        return
      }

      // During a rolling deploy or local hot reload, the browser can receive
      // the new client before the backend exposes this endpoint. The existing
      // stream remains a valid fallback until the backend catches up.
      if (error instanceof ConnectError && error.code === Code.Unimplemented) return

      console.warn('Failed to refresh unread notifications', error)
    }
  }

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
    const streamReq = create(UnreadNotificationsRequestSchema, {})

    while (!controller.signal.aborted) {
      try {
        // Load a snapshot through a regular response first. Streaming responses
        // may be buffered by proxies, and this also catches updates missed while
        // a background tab had its stream paused.
        await refreshUnreadNotifications(controller.signal)
        if (controller.signal.aborted) return

        const stream = notificationClient.unreadNotifications(streamReq, {
          signal: controller.signal,
        })
        for await (const message of stream) {
          unreadCount.value = Number(message.count)
        }
      } catch (error) {
        if (controller.signal.aborted) return

        if (error instanceof ConnectError && error.code === Code.Unauthenticated) {
          streamingEnabled = false
          pauseUnreadNotificationStream()
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
    reconciliationTimer = setInterval(() => {
      void refreshUnreadNotifications(controller.signal)
    }, reconciliationIntervalMs)
    void runUnreadNotificationStream(controller).finally(() => {
      if (streamController === controller) streamController = undefined
    })
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

  return {
    refreshUnreadNotifications,
    stopUnreadNotifications,
    streamUnreadNotifications,
    unreadCount,
  }
})
