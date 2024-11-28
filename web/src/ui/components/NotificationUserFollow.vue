<script setup lang="ts">
import type { Notification } from '@/proto/api/v1/users_pb.ts'

import { UserPlusIcon } from '@heroicons/vue/24/outline'
import { formatUnixToRelativeDateTime } from '@/utils/datetime.ts'

const props = defineProps<{
  notification: Notification
}>()
</script>

<template>
  <RouterLink
    :to="`/users/${props.notification.type.value?.actor?.id}`"
    class="flex w-full items-center gap-x-3"
  >
    <UserPlusIcon class="w-6 h-6" />
    <div class="w-full">
      <div>
        <span class="font-semibold">
          {{ props.notification.type.value?.actor?.firstName }}
          {{ props.notification.type.value?.actor?.lastName }}
        </span>
        followed you
      </div>
      <p class="text-xs text-gray-700 mt-1">
        {{ formatUnixToRelativeDateTime(props.notification.notifiedAtUnix) }}
      </p>
    </div>
  </RouterLink>
</template>

<style scoped></style>
