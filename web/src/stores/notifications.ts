import { ref } from 'vue'
import { defineStore } from 'pinia'
import { create } from '@bufbuild/protobuf'
import { NotificationClient } from '@/clients/clients.ts'
import { UnreadNotificationsRequestSchema } from '@/proto/api/v1/notifications_pb.ts'

export const useNotificationStore = defineStore('notifications', () => {
  const unreadCount = ref(0)

  const streamUnreadNotifications = async () => {
    const req = create(UnreadNotificationsRequestSchema, {})
    while (true) {
      try {
        const stream = NotificationClient.unreadNotifications(req)
        for await (const message of stream) {
          unreadCount.value = Number(message.count)
        }

        break
      } catch (error) {
        console.error('Stream disconnected, retrying...', error)
      }

      // Wait before retrying.
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }

  return { streamUnreadNotifications, unreadCount }
})
