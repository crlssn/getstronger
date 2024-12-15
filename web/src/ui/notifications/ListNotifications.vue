<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppList from '@/ui/components/AppList.vue'
import { listNotifications, markNotificationAsRead } from '@/http/requests.ts'
import AppListItem from '@/ui/components/AppListItem.vue'
import { type Notification } from '@/proto/api/v1/notification_service_pb.ts'
import NotificationUserFollow from '@/ui/components/NotificationUserFollow.vue'
import NotificationWorkoutComment from '@/ui/components/NotificationWorkoutComment.vue'
import usePagination from '@/utils/usePagination'
import AppAlert from '@/ui/components/AppAlert.vue'

const notifications = ref([] as Notification[])
const { hasMorePages, pageToken, resolvePageToken } = usePagination()

onMounted(async () => {
  await fetchNotifications()
  await markNotificationAsRead()
})

const fetchNotifications = async () => {
  const res = await listNotifications(pageToken.value)
  if (!res) return

  notifications.value = [...notifications.value, ...res.notifications]
  pageToken.value = resolvePageToken(res.pagination)
}
</script>

<template>
  <AppList v-if="notifications.length > 0" :can-fetch="hasMorePages" @fetch="fetchNotifications">
    <AppListItem v-for="notification in notifications" :key="notification.id">
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
  <AppAlert v-if="notifications.length === 0" type="info" message="Nothing here yet..."/>
</template>

<style scoped></style>
