<script setup lang="ts">
import type { PaginationRequest } from '@/proto/api/v1/shared_pb.ts'

import { onMounted, ref } from 'vue'
import { create } from '@bufbuild/protobuf'
import { UserClient } from '@/clients/clients.ts'
import { ListNotificationsRequestSchema, type Notification } from '@/proto/api/v1/users_pb.ts'

const notifications = ref([] as Notification[])
const pageToken = ref(new Uint8Array(0))

const fetchUnreadNotifications = async () => {
  const req = create(ListNotificationsRequestSchema, {
    onlyUnread: false,
    pagination: {
      pageLimit: 100,
      pageToken: pageToken.value,
    } as PaginationRequest,
  })

  const res = await UserClient.listNotifications(req)
  notifications.value = [...notifications.value, ...res.notifications]
  console.log(notifications.value, res.notifications)
  pageToken.value = res.pagination?.nextPageToken || new Uint8Array(0)
  if (pageToken.value.length > 0) {
    // TODO: Implement pagination.
    await fetchUnreadNotifications()
  }
}

onMounted(() => {
  fetchUnreadNotifications()
})
</script>

<template>
  <ul
    role="list"
    class="divide-y divide-gray-100 overflow-hidden bg-white shadow-sm ring-1 ring-gray-900/5 rounded-md"
  >
    <li
      v-for="notification in notifications"
      :key="notification.id"
    >
      <RouterLink
        :to="`/routines/${notification.id}`"
        class="font-medium flex justify-between items-center gap-x-6 px-4 py-5 hover:bg-gray-50 sm:px-6m text-sm/6 text-gray-800"
      >
        {{ notification }}
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped></style>
