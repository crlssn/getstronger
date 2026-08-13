import { ref } from 'vue'
import { defineStore } from 'pinia'
import { create } from '@bufbuild/protobuf'
import { notificationClient } from '@/http/clients.ts'
import { UnreadNotificationsRequestSchema } from '@/proto/api/v1/notification_service_pb.ts'
import { Code, ConnectError } from '@connectrpc/connect'
import { logoutUnauthenticatedUser } from '@/http/unauthenticated'

export const useNotificationStore = defineStore('notifications', () => {
  const unreadCount = ref(0)

  const streamUnreadNotifications = async () => {
    const req = create(UnreadNotificationsRequestSchema, {})
    while (true) {
      try {
        const stream = notificationClient.unreadNotifications(req)
        for await (const message of stream) {
          unreadCount.value = Number(message.count)
        }

        break
      } catch (error) {
        if (error instanceof ConnectError) {
          if (error.code === Code.Unauthenticated) {
            unreadCount.value = 0
            await logoutUnauthenticatedUser()
            return
          }
        }

        console.warn('Stream disconnected, retrying...', error)
      }

      // Wait before retrying.
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }

  return { streamUnreadNotifications, unreadCount }
})
