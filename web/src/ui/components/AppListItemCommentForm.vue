<script setup lang="ts">
import { create } from '@bufbuild/protobuf'
import { useTextareaAutosize } from '@vueuse/core'
import { WorkoutClient } from '@/clients/clients.ts'
import AppButton from '@/ui/components/AppButton.vue'
import { PostCommentRequestSchema } from '@/proto/api/v1/workouts_pb.ts'

const props = defineProps<{
  workoutId: string
}>()

const emits = defineEmits(['posted'])

const { input, textarea } = useTextareaAutosize()

const postComment = async () => {
  const req = create(PostCommentRequestSchema, {
    comment: input.value,
    workoutId: props.workoutId,
  })
  const res = await WorkoutClient.postComment(req)
  if (!res.comment) return
  emits('posted', res.comment)
  input.value = ''
}
</script>

<template>
  <li>
    <form @submit.prevent="postComment">
      <textarea
        ref="textarea"
        v-model="input"
        placeholder="Write a comment..."
      />
      <div class="flex">
        <AppButton
          type="submit"
          colour="primary"
        >
          Comment
        </AppButton>
      </div>
    </form>
  </li>
</template>

<style scoped>
textarea {
  @apply w-full border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm min-h-12 py-3 mb-2 resize-none overflow-hidden;
}
li {
  @apply flex justify-between items-center gap-x-6 px-4 py-5 text-sm text-gray-900;
}
</style>
