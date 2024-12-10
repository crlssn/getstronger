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
import { ChatBubbleOvalLeftEllipsisIcon, ChatBubbleLeftIcon, UserCircleIcon} from "@heroicons/vue/24/outline";

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
    class="divide-y divide-gray-200 mb-2 text-sm"
  >
    <div class="px-4 py-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <UserCircleIcon class="size-8 text-gray-900"/>
          <RouterLink
            :to="`/users/${props.workout.user?.id}`"
            class="font-semibold mr-2 ml-2"
          >
            {{ props.workout.user?.firstName }} {{ props.workout.user?.lastName }}
          </RouterLink>
          <span class="text-gray-500 text-xs">
            {{ formatToRelativeDateTime(props.workout.finishedAt) }}
          </span>
        </div>
        <DropdownButton
          v-if="workout.user?.id === authStore.userID"
          :items="dropdownItems"
        />
      </div>
    </div>
    <div class="pl-14 pr-4 py-3">
      <CardWorkoutExercise
        v-for="exerciseSet in workout.exerciseSets"
        :key="exerciseSet.exercise?.id"
        :exercise-id="exerciseSet.exercise?.id"
        :name="exerciseSet.exercise?.name"
        :sets="exerciseSet.sets"
      />
    </div>
    <div class="pl-14 pr-4 py-3">
      <span class="pl-1 text-xs text-gray-700 uppercase font-medium">0 Comments</span>
    </div>
  </div>
</template>
