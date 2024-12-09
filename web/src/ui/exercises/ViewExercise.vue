<script setup lang="ts">
import type { Exercise, Set } from '@/proto/api/v1/shared_pb.ts'

import { onMounted, ref } from 'vue'
import router from '@/router/router'
import { useRoute } from 'vue-router'
import { useAlertStore } from '@/stores/alerts'
import LineChart from '@/ui/components/LineChart.vue'
import { usePageTitleStore } from '@/stores/pageTitle'
import { deleteExercise, getExercise, listSets } from '@/http/requests'
import { ChevronRightIcon, TrashIcon } from '@heroicons/vue/24/outline'

import AppList from '../components/AppList.vue'
import AppListItem from '../components/AppListItem.vue'
import AppListItemLink from '../components/AppListItemLink.vue'

const exercise = ref<Exercise>()
const sets = ref<Array<Set>>([])

const route = useRoute()
const pageTitle = usePageTitleStore()
const alertStore = useAlertStore()

onMounted(async () => {
  const res = await getExercise(route.params.id as string)
  if (!res) return
  exercise.value = res.exercise
  pageTitle.setPageTitle(exercise.value?.name as string)
  await fetchSets()
})

const pageToken = ref(new Uint8Array(0))

const fetchSets = async () => {
  const res = await listSets(route.params.id as string, pageToken.value)
  if (!res) return
  sets.value = [...sets.value, ...res.sets]

  pageToken.value = res.pagination?.nextPageToken || new Uint8Array(0)
  if (pageToken.value.length > 0) {
    // TODO: Implement pagination.
    await fetchSets()
  }
}

const onDeleteExercise = async () => {
  if (confirm('Are you sure you want to delete this exercise?')) {
    await deleteExercise(route.params.id as string)
    alertStore.setError(`Exercise ${exercise.value?.name} deleted`)
    await router.push('/exercises')
  }
}
</script>

<template>
  <h6>Chart</h6>
  <div class="bg-white border border-gray-200 rounded-md px-4 py-4">
    <LineChart :sets="sets" />
  </div>

  <h6 class="mt-8">
    Sets
  </h6>
  <AppList>
    <AppListItemLink
      v-for="(set, index) in sets"
      :key="index"
      :to="`/workouts/${set.metadata.workoutId}`"
    >
      {{ set.weight }} kg x {{ set.reps }}
      <ChevronRightIcon />
    </AppListItemLink>
  </AppList>

  <h6 class="mt-8">
    Admin
  </h6>
  <AppList>
    <AppListItemLink :to="`/exercises/${route.params.id}/edit`">
      Update Exercise
      <ChevronRightIcon />
    </AppListItemLink>
    <AppListItem
      is="danger"
      class="cursor-pointer"
      @click="onDeleteExercise"
    >
      Delete Exercise
      <TrashIcon />
    </AppListItem>
  </AppList>
</template>
