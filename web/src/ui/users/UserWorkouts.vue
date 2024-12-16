<script setup lang="ts">
import CardWorkout from '@/ui/components/CardWorkout.vue'
import { listWorkouts } from '@/http/requests.ts'
import { onMounted, ref } from 'vue'
import type { Workout } from '@/proto/api/v1/workout_service_pb.ts'
import usePagination from '@/utils/usePagination.ts'
import { vInfiniteScroll } from '@vueuse/components'
import { usePageTitleStore } from '@/stores/pageTitle.ts'
import AppList from '@/ui/components/AppList.vue'
import AppListItem from '@/ui/components/AppListItem.vue'

const props = defineProps<{
  id: string
  pageTitle: string
}>()

const workouts = ref([] as Workout[])
const isMounted = ref(false)
const pageTitleStore = usePageTitleStore()
const { hasMorePages, pageToken, resolvePageToken } = usePagination()

onMounted(async () => {
  await fetchWorkouts()
  pageTitleStore.setPageTitle(props.pageTitle)
  isMounted.value = true
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
  <AppList v-if="isMounted && workouts.length === 0">
    <AppListItem> Nothing here yet...</AppListItem>
  </AppList>
</template>

<style scoped></style>
