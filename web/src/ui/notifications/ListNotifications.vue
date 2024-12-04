<script setup lang="ts">
import type { PaginationRequest } from '@/proto/api/v1/shared_pb.ts'

import { onMounted, ref } from 'vue'
import { create } from '@bufbuild/protobuf'
import AppList from '@/ui/components/AppList.vue'
import { NotificationClient } from '@/http/clients.ts'
import AppListItem from '@/ui/components/AppListItem.vue'
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
  <AppList>
    <AppListItem
      v-for="notification in notifications"
      :key="notification.id"
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
    </AppListItem>
  </AppList>
</template>

<style scoped></style>
