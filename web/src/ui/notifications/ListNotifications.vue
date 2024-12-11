<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppList from '@/ui/components/AppList.vue'
import {listNotifications} from "@/http/requests.ts";
import AppListItem from '@/ui/components/AppListItem.vue'
import { type Notification } from '@/proto/api/v1/notification_service_pb.ts'
import NotificationUserFollow from '@/ui/components/NotificationUserFollow.vue'
import NotificationWorkoutComment from '@/ui/components/NotificationWorkoutComment.vue'

onMounted(async () => {
  await fetchNotifications()
})

const notifications = ref([] as Notification[])
const pageToken = ref(new Uint8Array(0))

const fetchNotifications = async () => {
  const res = await listNotifications(pageToken.value)
  if (!res) return

  notifications.value = [...notifications.value, ...res.notifications]
  if (!res.pagination) return

  pageToken.value = res.pagination.nextPageToken
  if (pageToken.value.length > 0) {
    // TODO: Implement pagination.
    await fetchNotifications()
  }
}
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
