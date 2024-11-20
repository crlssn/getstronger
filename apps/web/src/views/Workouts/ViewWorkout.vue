<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { WorkoutClient } from '@/clients/clients'
import { GetWorkoutRequest, ListWorkoutsRequest, Workout } from '@/pb/api/v1/workouts_pb'
import Button from '@/components/Button.vue'
import { ChevronRightIcon } from '@heroicons/vue/20/solid'
import { useRoute } from 'vue-router'
import { usePageTitleStore } from '@/stores/pageTitle'

const workout = ref<Workout | undefined>(undefined)
const route = useRoute()
const pageTitleStore = usePageTitleStore()

const fetchWorkout = async () => {
  const req = new GetWorkoutRequest({
    id: route.params.id as string,
  })
  const res = await WorkoutClient.get(req)
  workout.value = res.workout
}

onMounted(async () => {
  await fetchWorkout()
  pageTitleStore.setPageTitle(workout?.value?.name as string)
})
</script>

<template>
  <!--  TODO: List exercises and sets -->
  <!--  -->
  <!--  <ul-->
  <!--    role="list"-->
  <!--    class="divide-y divide-gray-100 overflow-hidden bg-white shadow-sm ring-1 ring-gray-900/5 rounded-md"-->
  <!--  >-->
  <!--    <li class="font-medium flex justify-between items-center gap-x-6 px-4 py-5 hover:bg-gray-50 sm:px-6m text-sm/6 text-gray-800">{{ workout?.name }}</li>-->
  <!--    <li v-for="workout in workout?.exerciseSets" :key="workout.id" class="font-medium flex justify-between items-center gap-x-6 px-4 py-5 hover:bg-gray-50 sm:px-6m text-sm/6 text-gray-800">-->
  <!--        {{ workout.name }}-->
  <!--    </li>-->
  <!--  </ul>-->
</template>

<style scoped></style>
