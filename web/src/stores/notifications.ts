import { ref } from 'vue'
import { defineStore } from 'pinia'
import { create } from '@bufbuild/protobuf'
import { notificationClient } from '@/http/clients.ts'
import { GetUnreadNotificationCountRequestSchema } from '@/proto/api/v1/notification_service_pb.ts'
import { Code, ConnectError } from '@connectrpc/connect'
import { refreshAccessTokenOrLogout } from '@/jwt/jwt'
import { useAuthStore } from '@/stores/auth'

const pollIntervalMs = 60 * 1000

export const useNotificationStore = defineStore('notifications', () => {
  const unreadCount = ref(0)

  let pollingEnabled = false
  let pollController: AbortController | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined

  const countReq = create(GetUnreadNotificationCountRequestSchema, {})

  const pausePolling = () => {
    pollController?.abort()
    pollController = undefined
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = undefined
  }

  const endSession = () => {
    pollingEnabled = false
    pausePolling()
    unreadCount.value = 0
  }

  // The access token lives for 15 minutes, so a tab returning from the
  // background often polls with an expired token. Refresh and retry once
  // rather than leaving the badge stale until the next tick;
  // refreshAccessTokenOrLogout redirects to the login page by itself once the
  // refresh token is gone too.
  const refreshUnreadNotifications = async (signal?: AbortSignal, retried = false) => {
    try {
      const snapshot = await notificationClient.getUnreadNotificationCount(countReq, { signal })
      unreadCount.value = Number(snapshot.count)
    } catch (error) {
      if (signal?.aborted) return

      if (error instanceof ConnectError && error.code === Code.Unauthenticated) {
        await refreshAccessTokenOrLogout()
        if (!useAuthStore().authorised) {
          endSession()
          return
        }

        if (!retried) await refreshUnreadNotifications(signal, true)
        return
      }

      console.warn('Failed to refresh unread notifications', error)
    }
  }

  const startPollingIfVisible = () => {
    if (!pollingEnabled || pollController) return
    if (typeof document !== 'undefined' && document.hidden) return

    const controller = new AbortController()
    pollController = controller
    pollTimer = setInterval(() => {
      void refreshUnreadNotifications(controller.signal)
    }, pollIntervalMs)
    void refreshUnreadNotifications(controller.signal)
  }

  const pollUnreadNotifications = () => {
    pollingEnabled = true
    startPollingIfVisible()
  }

  const stopUnreadNotifications = endSession

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        pausePolling()
        return
      }

      startPollingIfVisible()
    })
  }

  return {
    pollUnreadNotifications,
    refreshUnreadNotifications,
    stopUnreadNotifications,
    unreadCount,
  }
})
