<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { create } from '@bufbuild/protobuf'
import { useAuthStore } from '@/stores/auth.ts'
import { WorkoutClient } from '@/http/clients.ts'
import { useTextareaAutosize } from '@vueuse/core'
import { deleteWorkout } from '@/http/requests.ts'
import { useAlertStore } from '@/stores/alerts.ts'
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
const authStore = useAuthStore()
const alertStore = useAlertStore()
const workoutDeleted = ref(false)

const props = defineProps<{
  workout: Workout
}>()

const dropdownItems: Array<DropdownItem> = [
  { href: `/workout/${props.workout.id}/edit`, title: 'Edit' },
  { func: async () => {
    if (confirm('Are you sure you want to delete this workout?')) {
      await deleteWorkout(props.workout.id)
      alertStore.setErrorWithoutPageRefresh('Workout deleted')
      workoutDeleted.value = true
    }
  }, title: 'Delete' },
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
  <div
    v-if="!workoutDeleted"
    class="divide-y divide-gray-200 overflow-hidden rounded-md bg-white shadow mb-4 text-sm"
  >
    <div class="px-4 py-5">
      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <RouterLink
            :to="`/users/${props.workout.user?.id}`"
            class="font-semibold mr-2"
          >
            {{ props.workout.user?.firstName }} {{ props.workout.user?.lastName }}
          </RouterLink>
          <span class="text-gray-500 text-sm">
            {{ formatToRelativeDateTime(props.workout.finishedAt) }}
          </span>
        </div>
        <DropdownButton
          v-if="workout.user?.id === authStore.userID"
          :items="dropdownItems"
        />
      </div>
    </div>
    <div class="px-4 py-5">
      <CardWorkoutExercise
        v-for="exerciseSet in workout.exerciseSets"
        :key="exerciseSet.exercise?.id"
        :exercise-id="exerciseSet.exercise?.id"
        :name="exerciseSet.exercise?.name"
        :sets="exerciseSet.sets"
      />
    </div>
    <div class="px-4 py-5">
      <div
        v-if="comments.length > 0"
        class="mb-4"
      >
        <CardWorkoutComment
          v-for="comment in comments"
          :key="comment.id"
          :user="comment.user"
          :timestamp="comment.createdAt"
          :comment="comment.comment"
        />
      </div>
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
