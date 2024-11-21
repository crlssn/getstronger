<script setup lang="ts">
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/vue/20/solid'
import { onMounted, ref } from 'vue'
import { GetRoutineRequest, Routine } from '@/pb/api/v1/routines_pb'
import { RoutineClient } from '@/clients/clients'
import { useRoute } from 'vue-router'

const routine = ref<Routine | undefined>(undefined)
const route = useRoute()
const pageTitleStore = usePageTitleStore()

const fetchRoutine = async (id: string) => {
  const req = new GetRoutineRequest({ id })
  const res = await RoutineClient.get(req)
  routine.value = res.routine
}

onMounted(async () => {
  await fetchRoutine(route.params.id as string)
  pageTitleStore.setPageTitle(routine.value?.name as string)
})

import AppButton from '@/components/AppButton.vue'
import { usePageTitleStore } from '@/stores/pageTitle'
</script>

<template>
  <AppButton type="link" :to="`/workouts/routine/${route.params.id}`" colour="primary" class="mb-8">
    Start Workout
  </AppButton>
  <ul
    role="list"
    class="divide-y divide-gray-100 overflow-hidden bg-white shadow-sm ring-1 ring-gray-900/5 rounded-md mb-4"
  >
    <li v-for="exercise in routine?.exercises" :key="exercise.id">
      <div class="flex justify-between items-center px-4 py-3 text-sm/6 text-gray-900">
        {{ exercise.name }}
        <div>
          <ChevronUpIcon
            class="size-5 flex-none text-gray-400 hover:text-gray-600 cursor-pointer"
            aria-hidden="true"
          />
          <ChevronDownIcon
            class="size-5 flex-none text-gray-400 hover:text-gray-600 cursor-pointer"
            aria-hidden="true"
          />
        </div>
      </div>
    </li>
  </ul>
  <AppButton type="button" colour="gray" class="mt-4">Edit Routine</AppButton>
  <AppButton type="button" colour="red" class="mt-4">Delete Routine</AppButton>
</template>
