<script setup lang="ts">
import CardWorkout from '@/ui/components/CardWorkout.vue'
import { listWorkouts } from '@/http/requests.ts'
import { onMounted, ref } from 'vue'
import type { Workout } from '@/proto/api/v1/workout_service_pb.ts'
import usePagination from '@/utils/usePagination.ts'
import { vInfiniteScroll } from '@vueuse/components'
import { usePageTitleStore } from '@/stores/pageTitle.ts'

const props = defineProps<{
  id: string
  pageTitle: string
}>()

const workouts = ref([] as Workout[])
const pageTitleStore = usePageTitleStore()
const { hasMorePages, pageToken, resolvePageToken } = usePagination()

onMounted(async () => {
  await fetchWorkouts()
  pageTitleStore.setPageTitle(props.pageTitle)
})

const fetchWorkouts = async () => {
  const userIds = [props.id]
  const res = await listWorkouts(userIds, pageToken.value)
  if (!res) return

  workouts.value = [...workouts.value, ...res.workouts]
  pageToken.value = resolvePageToken(res.pagination)
}
</script>

<template>
  <CardWorkout v-for="workout in workouts" :key="workout.id" compact :workout="workout" />
  <div v-if="hasMorePages" v-infinite-scroll="fetchWorkouts" />
</template>

<style scoped></style>
