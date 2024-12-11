<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppList from '@/ui/components/AppList.vue'
import { listNotifications, markNotificationAsRead } from '@/http/requests.ts'
import AppListItem from '@/ui/components/AppListItem.vue'
import { type Notification } from '@/proto/api/v1/notification_service_pb.ts'
import NotificationUserFollow from '@/ui/components/NotificationUserFollow.vue'
import NotificationWorkoutComment from '@/ui/components/NotificationWorkoutComment.vue'
import { vInfiniteScroll } from '@vueuse/components'
import usePagination from '@/utils/usePagination.ts'

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
  <AppList>
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
  <div v-if="hasMorePages" v-infinite-scroll="fetchNotifications" />
</template>

<style scoped></style>
