<script setup lang="ts">
import type { User } from '@/proto/api/v1/shared_pb.ts'
import type { Workout } from '@/proto/api/v1/workouts_pb.ts'

import { formatUnixToRelativeDateTime } from '@/utils/datetime.ts'
import { ChatBubbleLeftRightIcon } from '@heroicons/vue/24/outline'

defineProps<{
  actor?: User
  timestamp: bigint
  workout?: Workout
}>()
</script>

<template>
  <RouterLink
    :to="`/workouts/${workout?.id}`"
    class="flex w-full items-center gap-x-3"
  >
    <ChatBubbleLeftRightIcon class="w-6 h-6" />
    <div class="w-full">
      <div>
        <span class="font-semibold">
          {{ actor?.firstName }}
          {{ actor?.lastName }}
        </span>
        commented on your
        <span class="font-semibold">
          {{ workout?.name }}
        </span>
        workout
      </div>
      <p class="text-xs text-gray-700 mt-1">
        {{ formatUnixToRelativeDateTime(timestamp) }}
      </p>
    </div>
  </RouterLink>
</template>

<style scoped></style>
