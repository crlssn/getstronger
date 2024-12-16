<script setup lang="ts">
import type { User } from '@/proto/api/v1/shared_pb.ts'
import type { Workout } from '@/proto/api/v1/workout_service_pb'

import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth.ts'
import { formatUnixToRelativeDateTime } from '@/utils/datetime.ts'
import { ChatBubbleLeftRightIcon } from '@heroicons/vue/24/outline'

const authStore = useAuthStore()

const props = defineProps<{
  actor?: User
  timestamp: bigint
  workout?: Workout
}>()

const workoutOwnership = computed(() => {
  if (authStore.userId === props.workout?.user?.id) {
    return 'your'
  }

  if (props.actor?.id === props.workout?.user?.id) {
    return 'their'
  }

  return `${props.workout?.user?.firstName}'s`
})
</script>

<template>
  <RouterLink :to="`/workouts/${workout?.id}`" class="flex w-full items-center gap-x-3">
    <ChatBubbleLeftRightIcon class="size-7" />
    <div class="w-full font-normal">
      <div>
        <span class="font-semibold">
          {{ actor?.firstName }}
          {{ actor?.lastName }}
        </span>
        commented on {{ workoutOwnership }}
        <span class="font-semibold">
          {{ workout?.name }}
        </span>
        workout
      </div>
      <p class="text-sm text-gray-500">
        {{ formatUnixToRelativeDateTime(timestamp) }}
      </p>
    </div>
  </RouterLink>
</template>

<style scoped></style>
