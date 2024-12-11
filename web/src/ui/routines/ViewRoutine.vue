<script setup lang="ts">
import type { SortableEvent } from 'sortablejs'

import { onMounted, ref } from 'vue'
import router from '@/router/router'
import { useRoute } from 'vue-router'
import {useAlertStore} from "@/stores/alerts.ts";
import AppList from '@/ui/components/AppList.vue'
import AppButton from '@/ui/components/AppButton.vue'
import { usePageTitleStore } from '@/stores/pageTitle'
import AppListItem from '@/ui/components/AppListItem.vue'
import { useSortable } from '@vueuse/integrations/useSortable'
import {
  type Routine,
} from '@/proto/api/v1/routine_service_pb.ts'
import {deleteRoutine, getRoutine, updateExerciseOrder} from '@/http/requests'
import { ChevronRightIcon, ChevronUpDownIcon, TrashIcon } from '@heroicons/vue/24/outline'

import AppListItemLink from '../components/AppListItemLink.vue'

const routine = ref<Routine | undefined>(undefined)
const route = useRoute()
const pageTitleStore = usePageTitleStore()
const alertStore = useAlertStore()
const el = ref<HTMLElement | null>(null)

onMounted(async () => {
  await fetchRoutine(route.params.id as string)
  pageTitleStore.setPageTitle(routine.value?.name as string)
})

const fetchRoutine = async (id: string) => {
  const res = await getRoutine(id)
  if (!res) return

  routine.value = res.routine
}

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
    const exerciseIDs = exercises.map((e) => e.id)

    await updateExerciseOrder(routine.value?.id as string, exerciseIDs)
  },
})

const onDeleteRoutine = async () => {
  if (confirm('Are you sure you want to delete this routine?')) {
    await deleteRoutine(routine.value?.id as string)
    alertStore.setError('Routine deleted')
    await router.push('/routines')
  }
}
</script>

<template>
  <AppButton
    type="link"
    :to="`/workouts/routine/${route.params.id}`"
    colour="primary"
    container-class="px-4 pb-4"
  >
    Start Workout
  </AppButton>
  <h6>Exercises</h6>
  <AppList ref="el">
    <AppListItem
      v-for="exercise in routine?.exercises"
      :key="exercise.id"
      :data-id="exercise.id"
      class="hover:cursor-move"
    >
      {{ exercise.name }}
      <ChevronUpDownIcon class="size-8" />
    </AppListItem>
  </AppList>
  <h6>Admin</h6>
  <AppList>
    <AppListItemLink :to="`/routines/${route.params.id}/edit`">
      Update Routine
      <ChevronRightIcon class="size-6" />
    </AppListItemLink>
    <AppListItem
      is="danger"
      class="cursor-pointer"
      @click="onDeleteRoutine"
    >
      Delete Routine
      <TrashIcon class="size-6" />
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
