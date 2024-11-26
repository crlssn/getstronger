<script setup lang="ts">
import router from '@/router/router'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { create } from '@bufbuild/protobuf'
import { WorkoutClient } from '@/clients/clients'
import AppButton from '@/ui/components/AppButton.vue'
import { usePageTitleStore } from '@/stores/pageTitle'
import { formatToCompactDateTime } from '@/utils/datetime'
import {
  DeleteWorkoutRequestSchema,
  GetWorkoutRequestSchema,
  type Workout,
} from '@/proto/api/v1/workouts_pb'

const workout = ref<undefined | Workout>(undefined)
const route = useRoute()
const pageTitleStore = usePageTitleStore()

onMounted(async () => {
  await fetchWorkout()
  pageTitleStore.setPageTitle(workout?.value?.name as string)
})

const fetchWorkout = async () => {
  const req = create(GetWorkoutRequestSchema, {
    id: route.params.id as string,
  })
  const res = await WorkoutClient.get(req)
  workout.value = res.workout
}

const deleteWorkout = async () => {
  const req = create(DeleteWorkoutRequestSchema, {
    id: route.params.id as string,
  })
  await WorkoutClient.delete(req)
  await router.push('/workouts')
}
</script>

<template>
  <h6>{{ formatToCompactDateTime(workout?.finishedAt) }}</h6>
  <ul
    class="divide-y divide-gray-100 overflow-hidden bg-white shadow-sm ring-1 ring-gray-900/5 rounded-md"
    role="list"
  >
    <li
      v-for="exerciseSet in workout?.exerciseSets"
      :key="exerciseSet.exercise?.id"
    >
      <p class="font-medium mb-2">
        {{ exerciseSet.exercise?.name }}
      </p>
      <p
        v-for="(set, index) in exerciseSet.sets"
        :key="index"
        class="text-sm mb-1"
      >
        <span class="font-medium">Set {{ index + 1 }}:</span> {{ set.reps }} x {{ set.weight }} kg
      </p>
    </li>
  </ul>
  <AppButton
    type="button"
    colour="gray"
    class="mt-6"
  >
    Edit Workout
  </AppButton>
  <AppButton
    type="button"
    colour="red"
    class="mt-6"
    @click="deleteWorkout"
  >
    Delete Workout
  </AppButton>
</template>

<style scoped>
h6 {
  @apply text-xs font-medium text-gray-600 mb-2 uppercase;
}
li {
  @apply block px-4 py-5;
}
</style>
