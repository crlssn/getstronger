import { create as createMessage } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { create } from 'zustand'

import { notificationClient } from '@/http/clients'
import { refreshAccessTokenOrLogout } from '@/jwt/jwt'
import { GetUnreadNotificationCountRequestSchema } from '@/proto/api/v1/notification_service_pb'
import { selectAuthorised, useAuthStore } from '@/stores/auth'

const pollIntervalMs = 60 * 1000

interface NotificationState {
  unreadCount: number
  refreshUnreadNotifications: (signal?: AbortSignal, retried?: boolean) => Promise<void>
  pollUnreadNotifications: () => void
  stopUnreadNotifications: () => void
}

// Polling machinery rather than state: nothing renders from it, and putting a
// timer handle in the store would re-render every subscriber when polling
// starts.
let pollingEnabled = false
let pollController: AbortController | undefined
let pollTimer: ReturnType<typeof setInterval> | undefined
let watchingVisibility = false

const countReq = createMessage(GetUnreadNotificationCountRequestSchema, {})

export const useNotificationStore = create<NotificationState>()((set, get) => {
  const pausePolling = () => {
    pollController?.abort()
    pollController = undefined
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = undefined
  }

  const startPollingIfVisible = () => {
    if (!pollingEnabled || pollController) return
    if (typeof document !== 'undefined' && document.hidden) return

    const controller = new AbortController()
    pollController = controller
    pollTimer = setInterval(() => {
      void get().refreshUnreadNotifications(controller.signal)
    }, pollIntervalMs)
    void get().refreshUnreadNotifications(controller.signal)
  }

  const onVisibilityChange = () => {
    if (document.hidden) {
      pausePolling()
      return
    }
    startPollingIfVisible()
  }

  const endSession = () => {
    pollingEnabled = false
    pausePolling()
    if (watchingVisibility) {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      watchingVisibility = false
    }
    set({ unreadCount: 0 })
  }

  return {
    unreadCount: 0,

    // The access token lives for 15 minutes, so a tab returning from the
    // background often polls with an expired token. Refresh and retry once
    // rather than leaving the badge stale until the next tick;
    // refreshAccessTokenOrLogout redirects to the login page by itself once the
    // refresh token is gone too.
    refreshUnreadNotifications: async (signal, retried = false) => {
      try {
        const snapshot = await notificationClient.getUnreadNotificationCount(countReq, { signal })
        set({ unreadCount: Number(snapshot.count) })
      } catch (error) {
        if (signal?.aborted) return

        if (error instanceof ConnectError && error.code === Code.Unauthenticated) {
          await refreshAccessTokenOrLogout()
          if (!selectAuthorised(useAuthStore.getState())) {
            endSession()
            return
          }

          if (!retried) await get().refreshUnreadNotifications(signal, true)
          return
        }

        console.warn('Failed to refresh unread notifications', error)
      }
    },

    // The visibility listener is registered here rather than at module scope,
    // so importing this store has no side effect and stopping polling really
    // does stop it.
    pollUnreadNotifications: () => {
      pollingEnabled = true
      if (typeof document !== 'undefined' && !watchingVisibility) {
        document.addEventListener('visibilitychange', onVisibilityChange)
        watchingVisibility = true
      }
      startPollingIfVisible()
    },

    stopUnreadNotifications: endSession,
  }
})
