<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getWorkout } from '@/http/requests.ts'
import { usePageTitleStore } from '@/stores/pageTitle'
import CardWorkout from '@/ui/components/CardWorkout.vue'
import { type Workout } from '@/proto/api/v1/workout_service_pb.ts'

const route = useRoute()
const workout = ref<Workout>()
const pageTitleStore = usePageTitleStore()

onMounted(async () => {
  await fetchWorkout()
  pageTitleStore.setPageTitle(workout?.value?.name as string)
})

const fetchWorkout = async () => {
  const res = await getWorkout(route.params.id as string)
  if (!res) return

  workout.value = res.workout
}
</script>

<template>
  <CardWorkout v-if="workout" :workout="workout" :compact="false" />
</template>

<style scoped></style>
