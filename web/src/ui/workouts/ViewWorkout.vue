<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ExerciseClient, WorkoutClient } from '@/clients/clients'
import { DeleteWorkoutRequest, GetWorkoutRequest, Workout } from '@/pb/api/v1/workouts_pb'
import AppButton from '@/ui/components/AppButton.vue'
import { useRoute } from 'vue-router'
import { usePageTitleStore } from '@/stores/pageTitle'
import { Exercise, ListExercisesRequest } from '@/pb/api/v1/exercise_pb'
import { formatToCompactDateTime } from '@/utils/datetime'
import router from '@/router/router'

const workout = ref<Workout | undefined>(undefined)
const exercises = ref<Exercise[]>()
const route = useRoute()
const pageTitleStore = usePageTitleStore()

onMounted(async () => {
  await fetchWorkout()
  await fetchExercises()
  pageTitleStore.setPageTitle(workout?.value?.name as string)
})

const fetchWorkout = async () => {
  const req = new GetWorkoutRequest({
    id: route.params.id as string,
  })
  const res = await WorkoutClient.get(req)
  workout.value = res.workout
}

const fetchExercises = async () => {
  const exerciseIDs: string[] = []
  workout.value?.exerciseSets.forEach((exerciseSet) => {
    exerciseIDs.push(exerciseSet.exerciseId)
  })

  console.log(exerciseIDs)
  const req = new ListExercisesRequest({
    exerciseIds: exerciseIDs,
    pageSize: 100, // TODO: Handle workouts with more than 100 exercises.
  })
  const res = await ExerciseClient.list(req)
  exercises.value = res.exercises
}

const getExercise = (id: string) => {
  return exercises.value?.find((exercise) => exercise.id === id)
}

const deleteWorkout = async () => {
  const req = new DeleteWorkoutRequest({
    id: route.params.id as string,
  })
  await WorkoutClient.delete(req)
  await router.push('/workouts')
}
</script>

<template>
  <h6>{{ formatToCompactDateTime(workout?.finishedAt?.toDate()) }}</h6>
  <ul
    class="divide-y divide-gray-100 overflow-hidden bg-white shadow-sm ring-1 ring-gray-900/5 rounded-md"
    role="list"
  >
    <li v-for="exerciseSet in workout?.exerciseSets" :key="exerciseSet.exerciseId">
      <p class="font-medium mb-2">{{ getExercise(exerciseSet.exerciseId)?.name }}</p>
      <p v-for="(set, index) in exerciseSet.sets" :key="index" class="text-sm mb-1">
        <span class="font-medium">Set {{ index + 1 }}:</span> {{ set.reps }} x {{ set.weight }} kg
      </p>
    </li>
  </ul>
  <AppButton type="button" colour="gray" class="mt-6">Edit Workout</AppButton>
  <AppButton type="button" colour="red" class="mt-6" @click="deleteWorkout"
    >Delete Workout</AppButton
  >
</template>

<style scoped>
h6 {
  @apply text-xs font-medium text-gray-600 mb-2 uppercase;
}
li {
  @apply block px-4 py-5;
}
</style>
