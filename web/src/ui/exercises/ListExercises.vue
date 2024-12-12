<script setup lang="ts">
import { type Exercise } from '@/proto/api/v1/shared_pb.ts'
import { onMounted, ref } from 'vue'
import { listExercises } from '@/http/requests.ts'
import AppList from '@/ui/components/AppList.vue'
import AppButton from '@/ui/components/AppButton.vue'
import { ChevronRightIcon } from '@heroicons/vue/20/solid'
import AppListItemLink from '@/ui/components/AppListItemLink.vue'
import usePagination from '@/utils/usePagination.ts'

const exercises = ref([] as Exercise[])
const { hasMorePages, pageToken, resolvePageToken } = usePagination()

onMounted(async () => {
  await fetchExercises()
})

const fetchExercises = async () => {
  const res = await listExercises(pageToken.value)
  if (!res) return

  exercises.value = [...exercises.value, ...res.exercises]
  pageToken.value = resolvePageToken(res.pagination)
}
</script>

<template>
  <AppButton type="link" to="/exercises/create" colour="primary" container-class="px-4 pb-4">
    Create Exercise
  </AppButton>
  <AppList :can-fetch="hasMorePages" @fetch="fetchExercises">
    <AppListItemLink
      v-for="exercise in exercises"
      :key="exercise.id"
      :to="`/exercises/${exercise.id}`"
    >
      {{ exercise.name }}
      <ChevronRightIcon class="size-8 text-gray-500" />
    </AppListItemLink>
  </AppList>
</template>
