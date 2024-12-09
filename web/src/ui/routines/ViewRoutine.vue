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
import { useSortable } from '@vueuse/integrations/useSortable'
import { ChevronRightIcon, ChevronUpDownIcon, TrashIcon } from '@heroicons/vue/24/outline'
import {
  GetRoutineRequestSchema,
  type Routine,
  UpdateExerciseOrderRequestSchema,
} from '@/proto/api/v1/routines_pb'

import AppListItemLink from '../components/AppListItemLink.vue'
import {useAlertStore} from "@/stores/alerts.ts";

const routine = ref<Routine | undefined>(undefined)
const route = useRoute()
const pageTitleStore = usePageTitleStore()
const alertStore = useAlertStore()
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
  chosenClass: 'sortable-chosen',
  dragClass: 'sortable-drag',
  ghostClass: 'sortable-ghost',
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
  if (confirm('Are you sure you want to delete this routine?')) {
    await deleteRoutine(routine.value?.id as string)
    alertStore.setError(`Routine ${routine.value?.name} deleted`)
    await router.push('/routines')
  }
}
</script>

<template>
  <AppButton
    type="link"
    :to="`/workouts/routine/${route.params.id}`"
    colour="primary"
  >
    Start Workout
  </AppButton>
  <h6 class="mt-8">
    Exercises
  </h6>
  <AppList ref="el">
    <AppListItem
      v-for="exercise in routine?.exercises"
      :key="exercise.id"
      :data-id="exercise.id"
      class="hover:cursor-move"
    >
      {{ exercise.name }}
      <ChevronUpDownIcon />
    </AppListItem>
  </AppList>
  <h6 class="mt-8">
    Admin
  </h6>
  <AppList>
    <AppListItemLink :to="`/routines/${route.params.id}/edit`">
      Update Routine
      <ChevronRightIcon />
    </AppListItemLink>
    <AppListItem
      is="danger"
      class="cursor-pointer"
      @click="onDeleteRoutine"
    >
      Delete Routine
      <TrashIcon />
    </AppListItem>
  </AppList>
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
