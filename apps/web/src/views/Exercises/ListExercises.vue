<script setup lang="ts">
import { Exercise, ListExercisesRequest } from '@/pb/api/v1/exercise_pb'
import { ExerciseClient } from '@/clients/clients'
import { onMounted, ref } from 'vue'
import { ChevronRightIcon } from '@heroicons/vue/20/solid'
import Button from '@/components/Button.vue'

const exercises = ref(Array<Exercise>())
const name = ref('')
const pageToken = ref(new Uint8Array(0))

onMounted(() => {
  fetchExercises()
})

const fetchExercises = async () => {
  try {
    const request = new ListExercisesRequest({
      name: name.value,
      pageToken: pageToken.value,
      pageSize: 10,
    })

    const response = await ExerciseClient.list(request)
    exercises.value = [...exercises.value, ...response.exercises]

    if (response.nextPageToken.length > 0) {
      pageToken.value = response.nextPageToken
      await fetchExercises()
    }
  } catch (error) {
    console.error('fetch exercises failed:', error)
  }
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes === 0) {
    return `${remainingSeconds} sec`
  }

  if (remainingSeconds === 0) {
    return `${minutes} min`
  }

  return `${minutes} min ${remainingSeconds} sec`
}
</script>

<template>
  <Button type="link" to="/exercises/create" colour="primary">Create</Button>
  <ul
    role="list"
    class="divide-y divide-gray-100 overflow-hidden bg-white shadow-sm ring-1 ring-gray-900/5 rounded-xl"
  >
    <li v-for="exercise in exercises" :key="exercise.id">
      <RouterLink
        :to="`/exercises/${exercise.id}/edit`"
        class="flex justify-between items-center gap-x-6 px-4 py-5 hover:bg-gray-50 sm:px-6m text-sm/6 text-gray-900"
      >
        {{ exercise.name }}
        <ChevronRightIcon class="size-5 flex-none text-gray-400" aria-hidden="true" />
      </RouterLink>
    </li>
  </ul>
</template>
