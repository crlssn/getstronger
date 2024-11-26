<script setup lang="ts">
import { type Workout } from '@/proto/api/v1/workouts_pb.ts'
import { type DropdownItem } from '@/types/dropdown.ts'
import AppButton from '@/ui/components/AppButton.vue'
import AppTextarea from '@/ui/components/AppTextarea.vue'
import DropdownButton from '@/ui/components/DropdownButton.vue'
import CardWorkoutExercise from '@/ui/components/CardWorkoutExercise.vue'
import CardWorkoutComment from '@/ui/components/CardWorkoutComment.vue'
import { formatToRelativeDateTime } from '@/utils/datetime.ts'

const props = defineProps<{
  workout: Workout
}>()

const dropdownItems: Array<DropdownItem> = [
  { title: 'Edit', href: `/workout/${props.workout.id}/edit` },
  { title: 'Delete', href: `/workout/${props.workout.id}/delete` },
]
</script>

<template>
  <div class="divide-y divide-gray-200 overflow-hidden rounded-md bg-white shadow mb-4">
    <div class="px-4 py-5 sm:px-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <span class="font-semibold mr-2">Christian Carlsson</span>
          <span class="text-gray-500 text-sm">{{ formatToRelativeDateTime(workout.finishedAt) }}</span>
        </div>
        <DropdownButton :items="dropdownItems" />
      </div>
    </div>
    <div class="px-4 py-5 sm:p-6">
      <CardWorkoutExercise
        v-for="exerciseSet in workout.exerciseSets"
        :name="exerciseSet.exercise?.name"
        :sets="exerciseSet.sets"
        :key="exerciseSet.exercise?.id"
      />
    </div>
    <div class="px-4 py-4 sm:px-6">
      <div class="flex mb-4">
        <CardWorkoutComment
          name="Barbro Lundquist"
          comment="Repudiandae sint consequuntur vel. Amet ut nobis explicabo numquam expedita quia omnis
            voluptatem."
          :timestamp="new Date()"
        />
      </div>
      <AppTextarea placeholder="Write a comment..." :rows="2" />
      <div class="flex justify-end">
        <AppButton type="button" colour="primary">Comment</AppButton>
      </div>
    </div>
  </div>
</template>
