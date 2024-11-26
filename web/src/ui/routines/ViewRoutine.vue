<script setup lang="ts">
import { ChevronUpDownIcon } from '@heroicons/vue/20/solid'
import { onMounted, ref } from 'vue'
import { GetRoutineRequestSchema, type Routine, UpdateExerciseOrderRequestSchema } from '@/proto/api/v1/routines_pb'
import { RoutineClient } from '@/clients/clients'
import { useRoute } from 'vue-router'
import { useSortable } from '@vueuse/integrations/useSortable'
import AppButton from '@/ui/components/AppButton.vue'
import { usePageTitleStore } from '@/stores/pageTitle'
import type { SortableEvent } from 'sortablejs'
import { create } from '@bufbuild/protobuf'

const routine = ref<Routine | undefined>(undefined)
const route = useRoute()
const pageTitleStore = usePageTitleStore()
const el = ref<HTMLElement | null>(null)

const fetchRoutine = async (id: string) => {
  const req = create(GetRoutineRequestSchema,{ id })
  const res = await RoutineClient.get(req)
  routine.value = res.routine
}

onMounted(async () => {
  await fetchRoutine(route.params.id as string)
  pageTitleStore.setPageTitle(routine.value?.name as string)
})

useSortable(el, routine.value?.exercises || [], {
  ghostClass: 'sortable-ghost', // Class name for the drop placeholder
  chosenClass: 'sortable-chosen', // Class name for the chosen item
  dragClass: 'sortable-drag', // Class name for the dragging item
  onUpdate: async (event: SortableEvent) => {
    const oldIndex = event.oldIndex ?? 0
    const newIndex = event.newIndex ?? 0
    const exercises = routine.value?.exercises
    if (!exercises) {
      return
    }

    const [movedExercise] = exercises.splice(oldIndex, 1)
    exercises.splice(newIndex, 0, movedExercise)

    const updatedOrder = exercises.map((e) => e.id)
    const req = create(UpdateExerciseOrderRequestSchema,{
      routineId: routine.value?.id,
      exerciseIds: updatedOrder,
    })
    await RoutineClient.updateExerciseOrder(req)
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
      :data-id="exercise.id"
      class="flex justify-between items-center px-4 py-5 text-sm text-gray-900 hover:cursor-move"
    >
      {{ exercise.name }}
      <ChevronUpDownIcon class="size-5 flex-none text-gray-500" aria-hidden="true" />
    </li>
  </ul>
  <AppButton type="button" colour="gray" class="mt-4">Edit Routine</AppButton>
  <AppButton type="button" colour="red" class="mt-4">Delete Routine</AppButton>
</template>

<style scoped>
.sortable-drag {
  @apply bg-white rounded-md;
}

.sortable-ghost {
  @apply text-white;

  svg {
    @apply text-white;
  }
}
</style>
