<script setup lang="ts">
import type { Exercise } from '@/proto/api/v1/shared_pb.ts'

import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { create } from '@bufbuild/protobuf'
import { ExerciseClient } from '@/http/clients'
import AppList from '@/ui/components/AppList.vue'
import AppButton from '@/ui/components/AppButton.vue'
import { ChevronRightIcon } from '@heroicons/vue/20/solid'
import AppListItemLink from '@/ui/components/AppListItemLink.vue'
import { ListExercisesRequestSchema } from '@/proto/api/v1/exercise_pb'
import AppListItem from "@/ui/components/AppListItem.vue";

const exercises = ref(Array<Exercise>())
const name = ref('')
const pageToken = ref(new Uint8Array(0))
const route = useRoute()

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
  <div
    v-if="route.query.created === null"
    class="bg-green-200 border-b-2 border-t-2 border-green-300 -m-6 rounded-md py-4 px-9 mb-5 text-sm text-green-700 font-medium"
    role="alert"
  >
    Your exercise has been created
  </div>
  <AppButton
    type="link"
    to="/exercises/create"
    colour="primary"
    container-class="p-4 pb-0"
  >
    Create Exercise
  </AppButton>
  <AppList>
    <AppListItem is="header">Created</AppListItem>
    <AppListItemLink
      v-for="exercise in exercises"
      :key="exercise.id"
      :to="`/exercises/${exercise.id}`"
    >
      {{ exercise.name }}
      <ChevronRightIcon />
    </AppListItemLink>
  </AppList>
</template>
