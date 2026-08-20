<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppList from '@/ui/components/AppList.vue'
import AppSkeleton from '@/ui/components/AppSkeleton.vue'
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
const loaded = ref(false)
const markingAllAsRead = ref(false)
const hasUnreadNotifications = computed(() =>
  notifications.value.some((notification) => !notification.read),
)

onMounted(async () => {
  await fetchNotifications()
  loaded.value = true
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
  void markNotificationAsRead(notification.id, true).then(() =>
    notificationStore.refreshUnreadNotifications(),
  )
}

const markAllAsRead = async () => {
  if (!hasUnreadNotifications.value || markingAllAsRead.value) return

  markingAllAsRead.value = true
  try {
    const response = await markNotificationAsRead()
    if (!response) return

    for (const notification of notifications.value) notification.read = true
    notificationStore.unreadCount = 0
    void notificationStore.refreshUnreadNotifications()
  } finally {
    markingAllAsRead.value = false
  }
}
</script>

<template>
  <!-- A ghost button in the title row, not a floating pill: pills are for
       tags, actions are buttons. -->
  <Teleport v-if="hasUnreadNotifications" to="#page-nav-action">
    <button type="button" class="mark-all-read" :disabled="markingAllAsRead" @click="markAllAsRead">
      {{
        markingAllAsRead ? $t('profile.markingNotificationsAsRead') : $t('profile.markAllAsRead')
      }}
    </button>
  </Teleport>
  <AppSkeleton v-if="!loaded" />
  <AppList v-else :can-fetch="hasMorePages" @fetch="fetchNotifications">
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
      <span v-if="!notification.read" class="unread-dot" aria-hidden="true"></span>
    </AppListItem>
    <AppListItem v-if="notifications.length === 0">
      {{ $t('notifications.empty') }}
    </AppListItem>
  </AppList>
</template>

<style scoped>
@reference '../../assets/base.css';

.mark-all-read {
  @apply inline-flex min-h-(--size-control-sm) items-center whitespace-nowrap rounded-control px-3 text-sm font-semibold text-text-muted transition hover:bg-ink-surface hover:text-text disabled:cursor-wait disabled:text-text-subtle;
}
/* Unread is a state, not a colour of its own: the standard row with an ink
   icon tile, full-strength text and a green momentum dot. Read rows keep the
   same anatomy and simply fade. */
.notification-item {
  @apply relative transition-colors duration-200;
}
.notification-item :deep(a > svg) {
  @apply size-11 shrink-0 rounded-control bg-ink-surface p-2.5 text-text-subtle;
}
.notification-item :deep(a > div > div) {
  @apply text-text-muted;
}
.notification-item :deep(a > div > p) {
  @apply text-meta text-text-subtle;
}
.notification-item.unread :deep(a > svg) {
  @apply bg-ink-tint text-ink-strong;
}
.notification-item.unread :deep(a > div > div) {
  @apply text-text;
}
.unread-dot {
  @apply size-2 shrink-0 rounded-full bg-success;
}
</style>
