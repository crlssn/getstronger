<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
const markingAllAsRead = ref(false)
const hasUnreadNotifications = computed(() =>
  notifications.value.some((notification) => !notification.read),
)

onMounted(async () => {
  await fetchNotifications()
})

const fetchNotifications = async () => {
  const res = await listNotifications(pageToken.value)
  if (!res) return

  notifications.value = [...notifications.value, ...res.notifications]
  pageToken.value = resolvePageToken(res.pagination)
}

const markAsRead = (notification: Notification) => {
  if (notification.read) return

  notification.read = true
  notificationStore.unreadCount = Math.max(0, notificationStore.unreadCount - 1)
  void markNotificationAsRead(notification.id, true)
}

const markAllAsRead = async () => {
  if (!hasUnreadNotifications.value || markingAllAsRead.value) return

  markingAllAsRead.value = true
  try {
    const response = await markNotificationAsRead()
    if (!response) return

    for (const notification of notifications.value) notification.read = true
    notificationStore.unreadCount = 0
  } finally {
    markingAllAsRead.value = false
  }
}
</script>

<template>
  <div v-if="hasUnreadNotifications" class="notification-actions">
    <button type="button" :disabled="markingAllAsRead" @click="markAllAsRead">
      {{
        markingAllAsRead ? $t('profile.markingNotificationsAsRead') : $t('profile.markAllAsRead')
      }}
    </button>
  </div>
  <AppList :can-fetch="hasMorePages" @fetch="fetchNotifications">
    <AppListItem
      v-for="notification in notifications"
      :key="notification.id"
      class="notification-item"
      :class="{ unread: !notification.read }"
      @click="markAsRead(notification)"
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

.notification-actions {
  @apply mb-3 flex justify-end;
}
.notification-actions button {
  @apply min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-indigo-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 disabled:cursor-wait disabled:text-slate-400;
}
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
