import type { PaginationRequest } from '@/proto/api/v1/shared_pb.ts'

import { ref } from 'vue'
import { defineStore } from 'pinia'
import { create } from '@bufbuild/protobuf'
import { UserClient } from '@/clients/clients.ts'
import { ListNotificationsRequestSchema } from '@/proto/api/v1/users_pb.ts'

export const useNotificationStore = defineStore(
  'notifications',
  () => {
    const unreadCount = ref(0)
    const refreshInterval = ref(0)

    const fetchUnreadNotifications = async () => {
      const req = create(ListNotificationsRequestSchema, {
        markAsRead: false,
        pagination: {
          pageLimit: 1,
        } as PaginationRequest,
        unreadOnly: true,
      })
      const res = await UserClient.listNotifications(req)
      unreadCount.value = Number(res.pagination?.totalResults)
    }

    const setRefreshInterval = () => {
      // TODO: Implement Server-Sent Events for real-time updates.
      refreshInterval.value = window.setInterval(fetchUnreadNotifications, 60000)
    }

    return { fetchUnreadNotifications, setRefreshInterval, unreadCount }
  }
)
