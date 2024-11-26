<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { create } from '@bufbuild/protobuf'
import { useTextareaAutosize } from '@vueuse/core'
import { WorkoutClient } from '@/clients/clients.ts'
import AppButton from '@/ui/components/AppButton.vue'
import { type DropdownItem } from '@/types/dropdown.ts'
import DropdownButton from '@/ui/components/DropdownButton.vue'
import CardWorkoutComment from '@/ui/components/CardWorkoutComment.vue'
import CardWorkoutExercise from '@/ui/components/CardWorkoutExercise.vue'
import {
  PostCommentRequestSchema,
  type Workout,
  type WorkoutComment,
} from '@/proto/api/v1/workouts_pb.ts'

import { formatToRelativeDateTime } from '../../utils/datetime.ts'

const { input, textarea } = useTextareaAutosize()

const props = defineProps<{
  workout: Workout
}>()

const dropdownItems: Array<DropdownItem> = [
  { href: `/workout/${props.workout.id}/edit`, title: 'Edit' },
  { href: `/workout/${props.workout.id}/delete`, title: 'Delete' },
]

const comments = ref<Array<WorkoutComment>>([])

onMounted(() => {
  comments.value = props.workout.comments
})

const postComment = async () => {
  const req = create(PostCommentRequestSchema, {
    comment: input.value,
    workoutId: props.workout.id,
  })
  const res = await WorkoutClient.postComment(req)
  if (!res.comment) return
  comments.value.push(res.comment)
  input.value = ''
}
</script>

<template>
  <div class="divide-y divide-gray-200 overflow-hidden rounded-md bg-white shadow mb-4">
    <div class="px-4 py-5 sm:px-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <RouterLink
            :to="`/users/${workout.user?.id}`"
            class="font-semibold mr-2"
          >
            {{ workout.user?.firstName }} {{ workout.user?.lastName }}
          </RouterLink>
          <span class="text-gray-500 text-sm">
            {{ formatToRelativeDateTime(workout.finishedAt) }}
          </span>
        </div>
        <DropdownButton :items="dropdownItems" />
      </div>
    </div>
    <div class="px-4 py-5 sm:p-6">
      <CardWorkoutExercise
        v-for="exerciseSet in workout.exerciseSets"
        :key="exerciseSet.exercise?.id"
        :name="exerciseSet.exercise?.name"
        :sets="exerciseSet.sets"
      />
    </div>
    <div class="px-4 py-4 sm:px-6">
      <CardWorkoutComment
        v-for="comment in comments"
        :key="comment.id"
        :user="comment.user"
        :timestamp="comment.createdAt"
        :comment="comment.comment"
      />
      <form @submit.prevent="postComment">
        <textarea
          ref="textarea"
          v-model="input"
          class="w-full border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm min-h-12 py-3 mb-2 resize-none overflow-hidden"
          placeholder="Write a comment..."
        />
        <div class="flex justify-end">
          <AppButton
            type="submit"
            colour="primary"
          >
            Comment
          </AppButton>
        </div>
      </form>
    </div>
  </div>
</template>
