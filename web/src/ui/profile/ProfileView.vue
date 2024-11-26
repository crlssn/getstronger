<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ExerciseClient, WorkoutClient } from '@/clients/clients'
import { DeleteWorkoutRequestSchema, GetWorkoutRequestSchema, type Workout } from '@/proto/api/v1/workouts_pb'
import { useRoute } from 'vue-router'
import { usePageTitleStore } from '@/stores/pageTitle'
import { type Exercise, ListExercisesRequestSchema } from '@/proto/api/v1/exercise_pb'
import router from '@/router/router'
import {create} from "@bufbuild/protobuf";

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
  const req = create(GetWorkoutRequestSchema,{
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

  const req = create(ListExercisesRequestSchema,{
    exerciseIds: exerciseIDs,
    pageSize: 100, // TODO: Handle workouts with more than 100 exercises.
  })
  const res = await ExerciseClient.list(req)
  exercises.value = res.exercises
}

const findExercise = (id: string) => {
  return exercises.value?.find((exercise) => exercise.id === id)
}

const tabs = [
  { name: 'Workouts', href: '/profile' },
  { name: 'Personal Bests', href: '/profile?tab=personal-bests' },
  { name: 'Follows', href: '/profile?tab=follows' },
  { name: 'Followers', href: '/profile?tab=followers' },
]

const updateTab = (event: Event) => {
  const target = event.target as HTMLSelectElement
  router.push(target.value)
}
</script>

<template>
  <div>
    <div class="sm:hidden">
      <select
        id="tabs"
        name="tabs"
        @change="updateTab"
        class="block w-full rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
      >
        <option v-for="tab in tabs" :key="tab.name" :value="tab.href" :selected="tab.href === route.fullPath">{{ tab.name }}</option>
      </select>
    </div>
    <div class="hidden sm:block">
      <div class="border-b border-gray-200">
        <nav class="-mb-px flex" aria-label="Tabs">
          <RouterLink
            v-for="tab in tabs"
            :key="tab.name"
            :to="tab.href"
            :class="[
              tab.href === route.fullPath
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              'w-1/4 border-b-2 px-1 py-4 text-center text-sm font-medium',
            ]">
            {{ tab.name }}
          </RouterLink>
        </nav>
      </div>
    </div>
  </div>
  <!--  <div v-for="workout in workouts" :key="workout.id" class="mb-4">-->
  <!--    <h6>{{ formatToCompactDateTime(workout.finishedAt?.toDate()) }}</h6>-->
  <!--    <ul-->
  <!--      role="list"-->
  <!--      class="divide-y divide-gray-100 overflow-hidden bg-white shadow-sm ring-1 ring-gray-900/5 rounded-md"-->
  <!--    >-->
  <!--      <li>-->
  <!--        <RouterLink-->
  <!--          :to="`/workouts/${workout.id}`"-->
  <!--          class="font-medium flex justify-between items-center gap-x-6 px-4 py-5 hover:bg-gray-50 sm:px-6m text-sm/6 text-gray-800"-->
  <!--        >-->
  <!--          {{ workout.name }}-->
  <!--          <ChevronRightIcon class="size-5 flex-none text-gray-400" aria-hidden="true" />-->
  <!--        </RouterLink>-->
  <!--      </li>-->
  <!--    </ul>-->
  <!--  </div>-->
</template>

<style scoped></style>
