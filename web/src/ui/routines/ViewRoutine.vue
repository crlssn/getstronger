<script setup lang="ts">
import type { SortableEvent } from 'sortablejs'

import { onMounted, ref } from 'vue'
import router from '@/router/router'
import { useRoute } from 'vue-router'
import { create } from '@bufbuild/protobuf'
import { RoutineClient } from '@/http/clients'
import { deleteRoutine } from '@/http/requests'
import AppList from '@/ui/components/AppList.vue'
import AppButton from '@/ui/components/AppButton.vue'
import { usePageTitleStore } from '@/stores/pageTitle'
import AppListItem from '@/ui/components/AppListItem.vue'
import { ChevronUpDownIcon } from '@heroicons/vue/20/solid'
import { useSortable } from '@vueuse/integrations/useSortable'
import {
  GetRoutineRequestSchema,
  type Routine,
  UpdateExerciseOrderRequestSchema,
} from '@/proto/api/v1/routines_pb'

const routine = ref<Routine | undefined>(undefined)
const route = useRoute()
const pageTitleStore = usePageTitleStore()
const el = ref<HTMLElement | null>(null)

const fetchRoutine = async (id: string) => {
  const req = create(GetRoutineRequestSchema, { id })
  const res = await RoutineClient.get(req)
  routine.value = res.routine
}

onMounted(async () => {
  await fetchRoutine(route.params.id as string)
  pageTitleStore.setPageTitle(routine.value?.name as string)
})

useSortable(el, routine.value?.exercises || [], {
  chosenClass: 'sortable-chosen', // Class name for the chosen item
  dragClass: 'sortable-drag', // Class name for the dragging item
  ghostClass: 'sortable-ghost', // Class name for the drop placeholder
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
    const req = create(UpdateExerciseOrderRequestSchema, {
      exerciseIds: updatedOrder,
      routineId: routine.value?.id,
    })
    await RoutineClient.updateExerciseOrder(req)
  },
})

const onDeleteRoutine = async () => {
  await deleteRoutine(routine.value?.id as string)
  await router.push('/routines')
}
</script>

<template>
  <AppButton
    type="link"
    :to="`/workouts/routine/${route.params.id}`"
    colour="primary"
    class="mb-8"
  >
    Start Workout
  </AppButton>
  <AppList ref="el">
    <AppListItem
      v-for="exercise in routine?.exercises"
      :key="exercise.id"
      :data-id="exercise.id"
      class="hover:cursor-move"
    >
      {{ exercise.name }}
      <ChevronUpDownIcon
        class="size-5 flex-none text-gray-500"
      />
    </AppListItem>
  </AppList>
  <AppButton
    type="button"
    colour="gray"
    class="mt-4"
  >
    Edit Routine
  </AppButton>
  <AppButton
    type="button"
    colour="red"
    class="mt-4"
    @click="onDeleteRoutine"
  >
    Delete Routine
  </AppButton>
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
