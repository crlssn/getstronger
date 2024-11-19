<script setup lang="ts">
interface Props {
  id: string
}

const props = defineProps<Props>()

import Dropdown from '@/components/Dropdown.vue'
import { type DropdownItem } from '@/types/dropdown'
import Button from '@/components/Button.vue'
import Textarea from '@/components/Textarea.vue'
import CardWorkoutExercise from '@/components/CardWorkoutExercise.vue'
import CardWorkoutComment from '@/components/CardWorkoutComment.vue'

const dropdownItems: Array<DropdownItem> = [
  { title: 'Edit', href: `/workout/${props.id}/edit` },
  { title: 'Delete', href: `/workout/${props.id}/delete` },
]
</script>

<template>
  <div class="divide-y divide-gray-200 overflow-hidden rounded-lg bg-white shadow mb-4">
    <div class="px-4 py-5 sm:px-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <img
            class="h-8 w-8 rounded-full mr-4"
            src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
            alt=""
          />
          <span class="font-semibold mr-2">Christian Carlsson</span>
          <span class="text-gray-500 text-sm">4 hours ago</span>
        </div>
        <Dropdown :items="dropdownItems" />
      </div>
    </div>
    <div class="px-4 py-5 sm:p-6">
      <CardWorkoutExercise
        name="Latsdrag"
        label="Matrix"
        :sets="[
          { weight: 47.5, reps: 10 },
          { weight: 47.5, reps: 10 },
          { weight: 47.5, reps: 10 },
        ]"
      />
      <CardWorkoutExercise
        name="Sittande rodd"
        label="Matrix"
        :sets="[
          { weight: 47.5, reps: 10 },
          { weight: 47.5, reps: 10 },
          { weight: 47.5, reps: 10 },
        ]"
      />
    </div>
    <div class="px-4 py-4 sm:px-6">
      <div class="flex mb-4">
        <CardWorkoutComment
          imageURL="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
          name="Barbro Lundquist"
          comment="Repudiandae sint consequuntur vel. Amet ut nobis explicabo numquam expedita quia omnis
            voluptatem."
          :timestamp="new Date()"
        />
      </div>
      <Textarea placeholder="Write a comment..." :rows="2" />
      <div class="flex justify-end">
        <Button type="button" colour="primary">Comment</Button>
      </div>
    </div>
  </div>
</template>
