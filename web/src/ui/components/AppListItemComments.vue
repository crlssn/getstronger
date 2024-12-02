<script setup lang="ts">
import { type WorkoutComment } from '@/proto/api/v1/workouts_pb.ts'
import CardWorkoutComment from '@/ui/components/CardWorkoutComment.vue'

const props = defineProps<{
  comments: WorkoutComment[]
}>()
</script>

<template>
  <li>
    <CardWorkoutComment
      v-for="comment in props.comments"
      :key="comment.id"
      :user="comment.user"
      :timestamp="comment.createdAt"
      :comment="comment.comment"
    />
  </li>
</template>

<style scoped>
li {
  @apply flex justify-between items-center gap-x-6 px-4 py-5 text-sm text-gray-900;
}
</style>
