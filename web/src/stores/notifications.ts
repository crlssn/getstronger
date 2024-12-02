import { ref } from 'vue'
import { defineStore } from 'pinia'
import { NotificationClient } from '@/clients/clients.ts'

export const useNotificationStore = defineStore('notifications', () => {
  const unreadCount = ref(0)

  const streamUnreadNotifications = async () => {
    const stream = NotificationClient.unreadNotifications({})
    for await (const message of stream) {
      unreadCount.value = Number(message.count)
    }
  }

  return { streamUnreadNotifications, unreadCount }
})
