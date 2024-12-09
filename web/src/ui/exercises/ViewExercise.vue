<script setup lang="ts">
import type { Exercise } from '@/proto/api/v1/shared_pb.ts' // import { FieldMask } from '@bufbuild/protobuf'

import { onMounted, ref } from 'vue'
import router from '@/router/router'
import { useRoute } from 'vue-router'
import { usePageTitleStore } from '@/stores/pageTitle'
import { deleteExercise, getExercise } from '@/http/requests'
import { ChevronRightIcon, TrashIcon } from '@heroicons/vue/24/outline'

import AppList from '../components/AppList.vue'
import AppListItem from '../components/AppListItem.vue'
import AppListItemLink from '../components/AppListItemLink.vue'
import { useAlertStore } from '@/stores/alerts'

const exercise = ref<Exercise>()

const route = useRoute()
const pageTitle = usePageTitleStore()
const alertStore = useAlertStore()

onMounted(async () => {
  const res = await getExercise(route.params.id as string)
  if (!res) return
  exercise.value = res.exercise
  pageTitle.setPageTitle(exercise.value?.name as string)
})

const onDeleteExercise = async () => {
  if (confirm('Are you sure you want to delete this exercise?')) {
    await deleteExercise(route.params.id as string)
    alertStore.set({ type: 'error', message: `Exercise ${exercise.value?.name} deleted` })
    await router.push('/exercises')
  }
}
</script>

<template>
  <h6>Graph</h6>
  <div>
    Here's a graph
  </div>

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
