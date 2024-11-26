<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ExerciseClient, WorkoutClient } from '@/clients/clients'
import { GetWorkoutRequestSchema, type Workout } from '@/proto/api/v1/workouts_pb'
import { useRoute } from 'vue-router'
import { usePageTitleStore } from '@/stores/pageTitle'
import { type Exercise, ListExercisesRequestSchema } from '@/proto/api/v1/exercise_pb'
import router from '@/router/router'
import { create } from '@bufbuild/protobuf'
import AppButton from '@/ui/components/AppButton.vue'

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
  const req = create(GetWorkoutRequestSchema, {
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

  const req = create(ListExercisesRequestSchema, {
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

const person = {
  name: 'Jane Cooper',
  title: 'Paradigm Representative',
  role: 'Admin',
  email: 'janecooper@example.com',
  telephone: '+1-202-555-0170',
  imageUrl:
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=4&w=256&h=256&q=60',
}
</script>

<template>
  <div class="col-span-1 flex flex-col divide-y divide-gray-200 rounded-lg bg-white text-center shadow mb-4">
    <div class="flex flex-1 flex-col p-8">
      <img class="mx-auto size-32 shrink-0 rounded-full" :src="person.imageUrl" alt="" />
      <h3 class="mt-6 text-xl text-gray-900">{{ person.name }}</h3>
    </div>
    <div>
      <div class="-mt-px flex divide-x divide-gray-200">
        <div class="-ml-px flex w-0 flex-1">
          <RouterLink to="/settings" class="relative inline-flex w-0 flex-1 items-center justify-center gap-x-3 rounded-br-lg border border-transparent py-4 text-xs font-semibold uppercase text-gray-900">
            Settings
          </RouterLink>
        </div>
        <div class="-ml-px flex w-0 flex-1">
          <RouterLink to="/logout" class="relative inline-flex w-0 flex-1 items-center justify-center gap-x-3 rounded-br-lg border border-transparent py-4 text-xs font-semibold uppercase text-gray-900">
            Logout
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
  <div>
    <div class="sm:hidden">
      <select
        id="tabs"
        name="tabs"
        @change="updateTab"
        class="block w-full rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 py-4 px-5 font-medium text-sm"
      >
        <option
          v-for="tab in tabs"
          :key="tab.name"
          :value="tab.href"
          :selected="tab.href === route.fullPath"
        >
          {{ tab.name }}
        </option>
      </select>
    </div>
    <div class="hidden sm:block">
      <div class="border border-gray-200 bg-white rounded-md">
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
            ]"
          >
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
