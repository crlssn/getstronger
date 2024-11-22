<script setup lang="ts">
import { ChevronDownIcon, ChevronUpIcon, ChevronUpDownIcon } from '@heroicons/vue/20/solid'
import { onMounted, ref } from 'vue'
import { GetRoutineRequest, Routine } from '@/pb/api/v1/routines_pb'
import { RoutineClient } from '@/clients/clients'
import { useRoute } from 'vue-router'
import { useSortable } from '@vueuse/integrations/useSortable'
import AppButton from '@/components/AppButton.vue'
import { usePageTitleStore } from '@/stores/pageTitle'
import type { SortableEvent } from 'sortablejs'

const routine = ref<Routine | undefined>(undefined)
const route = useRoute()
const pageTitleStore = usePageTitleStore()
const el = ref<HTMLElement | null>(null)

const fetchRoutine = async (id: string) => {
  const req = new GetRoutineRequest({ id })
  const res = await RoutineClient.get(req)
  routine.value = res.routine
}

onMounted(async () => {
  await fetchRoutine(route.params.id as string)
  pageTitleStore.setPageTitle(routine.value?.name as string)
})

useSortable(el, routine.value?.exercises || [], {
  onUpdate: (event: SortableEvent) => {
    const oldIndex = event.oldIndex ?? 0
    const newIndex = event.newIndex ?? 0
    console.log(oldIndex, newIndex)

    const exercises = routine.value?.exercises
    if (exercises) {
      // Move the exercise in the local array
      const [movedExercise] = exercises.splice(oldIndex, 1)
      exercises.splice(newIndex, 0, movedExercise)

      // Optionally, send the updated list to the backend
      const updatedOrder = exercises.map((e) => e.id)
      console.log(updatedOrder)
      // sendReorderToBackend({ updatedOrder })
    }
    // console.log(typeof event)
    // console.log(event.items)
    // console.log(event.)
    // console.log(event.item.getAttribute('data-exercise-id'))
    // console.log(event.item.getAttribute('data-id'))
  },
})
</script>

<template>
  <AppButton type="link" :to="`/workouts/routine/${route.params.id}`" colour="primary" class="mb-8">
    Start Workout
  </AppButton>
  <ul
    ref="el"
    role="list"
    class="divide-y divide-gray-100 overflow-hidden bg-white shadow-sm ring-1 ring-gray-900/5 rounded-md mb-4"
  >
    <li
      v-for="exercise in routine?.exercises"
      :key="exercise.id"
      :data-exercise-id="exercise.id"
      class="flex justify-between items-center px-4 py-5 text-sm text-gray-900 hover:cursor-move"
    >
      <!--      <div class="">-->
      {{ exercise.name }}
      <ChevronUpDownIcon class="size-5 flex-none text-gray-400" aria-hidden="true" />
      <!--        <div>-->
      <!--          <ChevronUpIcon-->
      <!--            class="size-5 flex-none text-gray-400 hover:text-gray-600 cursor-pointer"-->
      <!--            aria-hidden="true"-->
      <!--          />-->
      <!--          <ChevronDownIcon-->
      <!--            class="size-5 flex-none text-gray-400 hover:text-gray-600 cursor-pointer"-->
      <!--            aria-hidden="true"-->
      <!--          />-->
      <!--        </div>-->
      <!--      </div>-->
    </li>
  </ul>
  <AppButton type="button" colour="gray" class="mt-4">Edit Routine</AppButton>
  <AppButton type="button" colour="red" class="mt-4">Delete Routine</AppButton>
</template>
