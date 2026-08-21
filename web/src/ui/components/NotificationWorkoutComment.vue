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

// The owner changes the sentence, not just a word ("din"/"sin" bind to the
// noun in Swedish), so each ownership case is a complete message.
const messageKey = computed(() => {
  if (authStore.userId === props.workout?.user?.id) {
    return 'notifications.commentedOnYourWorkout'
  }

  if (props.actor?.id === props.workout?.user?.id) {
    return 'notifications.commentedOnTheirWorkout'
  }

  return 'notifications.commentedOnUsersWorkout'
})
</script>

<template>
  <RouterLink :to="`/workouts/${workout?.id}`" class="flex w-full items-center gap-x-3">
    <ChatBubbleLeftRightIcon class="size-7" />
    <div class="w-full font-normal">
      <i18n-t :keypath="messageKey" tag="div" scope="global">
        <template #name>
          <span class="font-semibold">{{ actor?.username }}</span>
        </template>
        <template #owner>{{ workout?.user?.username }}</template>
        <template #workout>
          <span class="font-semibold">{{ workout?.name }}</span>
        </template>
      </i18n-t>
      <p class="text-sm text-text-subtle">
        {{ formatUnixToRelativeDateTime(timestamp) }}
      </p>
    </div>
  </RouterLink>
</template>

<style scoped></style>
