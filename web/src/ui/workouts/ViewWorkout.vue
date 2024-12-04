<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { create } from '@bufbuild/protobuf'
import { WorkoutClient } from '@/http/clients'
import { usePageTitleStore } from '@/stores/pageTitle'
import CardWorkout from '@/ui/components/CardWorkout.vue'
import {
  GetWorkoutRequestSchema,
  type Workout,
} from '@/proto/api/v1/workouts_pb'

const route = useRoute()
const workout = ref<Workout>()
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
</script>

<template>
  <CardWorkout
    v-if="workout"
    :workout="workout"
  />
</template>

<style scoped></style>
