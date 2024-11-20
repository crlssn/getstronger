<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { WorkoutClient } from '@/clients/clients'
import { ListWorkoutsRequest, Workout } from '@/pb/api/v1/workouts_pb'
import Button from '@/components/Button.vue'
import { ChevronRightIcon } from '@heroicons/vue/20/solid'

const pageToken = ref(new Uint8Array(0))
const workouts = ref(Array<Workout>())

const fetchWorkouts = async () => {
  const req = new ListWorkoutsRequest({
    pageSize: 100,
    pageToken: pageToken.value,
  })
  const res = await WorkoutClient.list(req)
  workouts.value = [...workouts.value, ...res.workouts]

  // TODO: Implement pagination.
  if (res.nextPageToken.length > 0) {
    pageToken.value = res.nextPageToken
    await fetchWorkouts()
  }
}

onMounted(() => {
  fetchWorkouts()
})
</script>

<template>
  <ul
    role="list"
    class="divide-y divide-gray-100 overflow-hidden bg-white shadow-sm ring-1 ring-gray-900/5 rounded-md"
  >
    <li v-for="workout in workouts" :key="workout.id">
      <RouterLink
        :to="`/workouts/${workout.id}`"
        class="font-medium flex justify-between items-center gap-x-6 px-4 py-5 hover:bg-gray-50 sm:px-6m text-sm/6 text-gray-800"
      >
        {{ workout.name }}
        <ChevronRightIcon class="size-5 flex-none text-gray-400" aria-hidden="true" />
      </RouterLink>
    </li>
  </ul>
</template>

<style scoped></style>
