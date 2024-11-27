<script setup lang="ts">
import type { Notification } from '@/proto/api/v1/users_pb.ts'

import { ChatBubbleLeftRightIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{
  notification: Notification
}>()
</script>

<template>
  <RouterLink
    :to="`/workouts/${props.notification.type.value?.workout?.id}`"
    class="flex w-full items-center gap-x-3"
  >
    <div class="w-full">
      <div>
        <span class="font-medium">
          {{ props.notification.type.value?.actor?.firstName }}
          {{ props.notification.type.value?.actor?.lastName }}
        </span>
        commented on your
        <span class="font-medium">
          {{ props.notification.type.value?.workout?.name }}
        </span>
        workout
      </div>
      <p class="text-xs text-gray-700 mt-1">
        1 week ago
      </p>
    </div>
    <ChatBubbleLeftRightIcon class="w-6 h-6" />
  </RouterLink>
</template>

<style scoped></style>
