<script setup lang="ts">
import type { PaginationRequest } from '@/proto/api/v1/shared_pb.ts'

import { onMounted, ref } from 'vue'
import { create } from '@bufbuild/protobuf'
import { NotificationClient } from '@/clients/clients.ts'
import NotificationUserFollow from '@/ui/components/NotificationUserFollow.vue'
import NotificationWorkoutComment from '@/ui/components/NotificationWorkoutComment.vue'
import { ListNotificationsRequestSchema, type Notification } from '@/proto/api/v1/notifications_pb.ts'

const notifications = ref([] as Notification[])
const pageToken = ref(new Uint8Array(0))

const fetchUnreadNotifications = async () => {
  const req = create(ListNotificationsRequestSchema, {
    markAsRead: true,
    pagination: {
      pageLimit: 100,
      pageToken: pageToken.value,
    } as PaginationRequest,
    unreadOnly: false,
  })

  const res = await NotificationClient.listNotifications(req)
  notifications.value = [...notifications.value, ...res.notifications]
  pageToken.value = res.pagination?.nextPageToken || new Uint8Array(0)
  if (pageToken.value.length > 0) {
    // TODO: Implement pagination.
    await fetchUnreadNotifications()
  }
}

onMounted(async () => {
  await fetchUnreadNotifications()
})
</script>

<template>
  <ul
    role="list"
    class="divide-y divide-gray-100 bg-white border border-gray-200 rounded-md"
  >
    <li
      v-for="notification in notifications"
      :key="notification.id"
      class="flex justify-between items-center gap-x-6 px-4 py-5 hover:bg-gray-50 text-sm text-gray-800"
    >
      <NotificationUserFollow
        v-if="notification.type.case === 'userFollowed'"
        :actor="notification.type.value?.actor"
        :timestamp="notification.notifiedAtUnix"
      />
      <NotificationWorkoutComment
        v-if="notification.type.case === 'workoutComment'"
        :actor="notification.type.value?.actor"
        :workout="notification.type.value?.workout"
        :timestamp="notification.notifiedAtUnix"
      />
    </li>
  </ul>
</template>

<style scoped></style>
