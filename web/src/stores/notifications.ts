import { ref } from 'vue'
import { defineStore } from 'pinia'
import { create } from '@bufbuild/protobuf'
import { notificationClient } from '@/http/clients.ts'
import {
  GetUnreadNotificationCountRequestSchema,
  UnreadNotificationsRequestSchema,
} from '@/proto/api/v1/notification_service_pb.ts'
import { Code, ConnectError } from '@connectrpc/connect'
import { refreshAccessTokenOrLogout } from '@/jwt/jwt'
import { useAuthStore } from '@/stores/auth'

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

  const endSession = () => {
    streamingEnabled = false
    pauseUnreadNotificationStream()
    unreadCount.value = 0
  }

  // The access token lives for 15 minutes and the server only checks it when a
  // request starts, so an open stream outlives its own token. Reconnecting is
  // what surfaces the expiry, which would otherwise sign the user out for
  // nothing more than switching back to the tab. Refresh and let the caller
  // retry; refreshAccessTokenOrLogout redirects to the login page by itself
  // once the refresh token is gone too.
  const recoverSession = async (): Promise<boolean> => {
    await refreshAccessTokenOrLogout()
    return useAuthStore().authorised
  }

  const refreshUnreadNotifications = async (signal?: AbortSignal) => {
    try {
      const snapshot = await notificationClient.getUnreadNotificationCount(countReq, { signal })
      unreadCount.value = Number(snapshot.count)
    } catch (error) {
      if (signal?.aborted) return

      if (error instanceof ConnectError && error.code === Code.Unauthenticated) {
        if (!(await recoverSession())) endSession()
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
    // Guards against refreshing on every retry when the backend keeps rejecting
    // a token it just issued. Cleared as soon as the stream delivers a message.
    let recoveryAttempted = false

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
          recoveryAttempted = false
          unreadCount.value = Number(message.count)
        }
      } catch (error) {
        if (controller.signal.aborted) return

        if (error instanceof ConnectError && error.code === Code.Unauthenticated) {
          if (recoveryAttempted || !(await recoverSession())) {
            endSession()
            return
          }

          recoveryAttempted = true
        } else {
          console.warn('Stream disconnected, retrying...', error)
        }
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

  const stopUnreadNotifications = endSession

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
