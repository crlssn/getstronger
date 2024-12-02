<script setup lang="ts">
import type { Exercise } from '@/proto/api/v1/shared_pb.ts'

import { onMounted, ref } from 'vue'
import { create } from '@bufbuild/protobuf'
import AppList from '@/ui/components/AppList.vue'
import { ExerciseClient } from '@/clients/clients'
import AppButton from '@/ui/components/AppButton.vue'
import { ChevronRightIcon } from '@heroicons/vue/20/solid'
import AppListItemLink from '@/ui/components/AppListItemLink.vue'
import { ListExercisesRequestSchema } from '@/proto/api/v1/exercise_pb'

const exercises = ref(Array<Exercise>())
const name = ref('')
const pageToken = ref(new Uint8Array(0))

onMounted(() => {
  fetchExercises()
})

const fetchExercises = async () => {
  try {
    const request = create(ListExercisesRequestSchema, {
      name: name.value,
      pageSize: 10,
      pageToken: pageToken.value,
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
</script>

<template>
  <AppButton
    type="link"
    to="/exercises/create"
    colour="primary"
  >
    Create Exercise
  </AppButton>
  <AppList>
    <AppListItemLink
      v-for="exercise in exercises"
      :key="exercise.id"
      :to="`/exercises/${exercise.id}/edit`"
    >
      {{ exercise.name }}
      <ChevronRightIcon class="size-5 flex-none text-gray-400" />
    </AppListItemLink>
  </AppList>
</template>
