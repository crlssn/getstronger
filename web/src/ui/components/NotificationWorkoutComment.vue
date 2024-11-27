<script setup lang="ts">
import type { Notification } from '@/proto/api/v1/users_pb.ts'
const props = defineProps<{
  notification: Notification
}>()
</script>

<template>
  <RouterLink :to="`/workouts/${props.notification.type.value?.workout?.id}`">
    <span class="font-medium">
      {{ props.notification.type.value?.actor?.firstName }}
      {{ props.notification.type.value?.actor?.lastName }}
    </span> commented on your
    <span class="font-medium">
      {{ props.notification.type.value?.workout?.name }}
    </span>
    workout
    <p class="text-xs text-gray-700 mt-1">
      1 week ago
    </p>
  </RouterLink>
</template>

<style scoped></style>
