<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppList from '@/ui/components/AppList.vue'
import { listNotifications, markNotificationAsRead } from '@/http/requests.ts'
import AppListItem from '@/ui/components/AppListItem.vue'
import { type Notification } from '@/proto/api/v1/notification_service_pb.ts'
import NotificationUserFollow from '@/ui/components/NotificationUserFollow.vue'
import NotificationWorkoutComment from '@/ui/components/NotificationWorkoutComment.vue'
import usePagination from '@/utils/usePagination'
import { useNotificationStore } from '@/stores/notifications'

const notifications = ref([] as Notification[])
const notificationStore = useNotificationStore()
const { hasMorePages, pageToken, resolvePageToken } = usePagination()

onMounted(async () => {
  await fetchNotifications()
  await markNotificationAsRead()
  notificationStore.unreadCount = 0
})

const fetchNotifications = async () => {
  const res = await listNotifications(pageToken.value)
  if (!res) return

  notifications.value = [...notifications.value, ...res.notifications]
  pageToken.value = resolvePageToken(res.pagination)
}
</script>

<template>
  <AppList :can-fetch="hasMorePages" @fetch="fetchNotifications">
    <AppListItem
      v-for="notification in notifications"
      :key="notification.id"
      class="notification-item"
      :class="{ unread: !notification.read }"
    >
      <span v-if="!notification.read" class="sr-only">
        {{ $t('profile.unreadNotification') }}
      </span>
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
    <AppListItem v-if="notifications.length === 0">
      Your notifications will appear here
    </AppListItem>
  </AppList>
</template>

<style scoped>
@reference '../../assets/base.css';

.notification-item {
  @apply relative transition-colors duration-200;
}
.notification-item.unread {
  @apply border-l-[3px] border-l-blue-500 bg-gradient-to-r from-blue-50 via-blue-50/60 to-white;
}
.notification-item.unread:hover {
  @apply from-blue-100/80 via-blue-50 to-white;
}
.notification-item.unread :deep(a > svg) {
  @apply size-10 rounded-xl bg-blue-100 p-2 text-blue-600 ring-1 ring-blue-200;
}
.notification-item.unread :deep(a > div > div) {
  @apply text-slate-950;
}
.notification-item.unread :deep(a > div > p) {
  @apply font-medium text-blue-600;
}
</style>
