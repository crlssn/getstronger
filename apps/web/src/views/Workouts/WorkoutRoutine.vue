<script setup lang="ts">
import Button from "@/components/Button.vue";
import {onMounted, ref, computed, watch} from "vue";
import {GetRoutineRequest, Routine} from "@/pb/api/v1/routines_pb";
import {RoutineClient} from "@/clients/clients";
import {useRoute} from "vue-router";
import {ChevronRightIcon} from "@heroicons/vue/20/solid";
import {usePageTitleStore} from "@/stores/pageTitle";

const route = useRoute()
const pageTitleStore = usePageTitleStore()
const routine = ref<Routine | undefined>(undefined)

const fetchRoutine = async (id: string) => {
  const req = new GetRoutineRequest({id})
  const res = await RoutineClient.get(req)
  routine.value = res.routine
}

onMounted(async () => {
  console.log(route.params)
  await fetchRoutine(route.params.routine_id as string)
  pageTitleStore.setPageTitle(routine.value?.name as string)
})

// const setView = computed(() => {
//   return route.query.exercise_id && route.query.exercise_id.length > 0;
// })
const setView = ref(false)
const exerciseID = ref('')

const setExerciseID = (id: string) => {
  exerciseID.value = id
  setView.value = true

  const exercise = routine.value?.exercises.find((exercise) => exercise.id === id)
  pageTitleStore.setPageTitle(exercise?.name as string)
}

const hasExerciseID = computed(() => {
  return exerciseID.value.length > 0
})

import WorkoutExercise from "@/views/Workouts/WorkoutExercise.vue";
</script>

<template>
  <form v-if="hasExerciseID">
    <Button type="button" colour="primary" class="mb-6" @click="setExerciseID('')">Back</Button>
    <div class="flex items-end">
      <div class="w-full">
        <label for="weight">Weight</label>
        <input id="weight" type="number">
      </div>
      <span>x</span>
      <div class="w-full">
        <label for="reps">Reps</label>
        <input id="reps" type="number">
      </div>
    </div>
    <Button type="submit" colour="primary" class="mt-6">Add Set</Button>
    <Button type="submit" colour="red" class="mt-6">Finish Workout</Button>
  </form>
  <ul v-else role="list">
    <li v-for="exercise in routine?.exercises" :key="exercise.id" @click="setExerciseID(exercise.id)">
      <div>
        {{ exercise.name }}
        <ChevronRightIcon class="size-5 flex-none text-gray-400" aria-hidden="true"/>
      </div>
    </li>
  </ul>
</template>

<style scoped>
ul {
  @apply divide-y divide-gray-100 overflow-hidden bg-white shadow-sm ring-1 ring-gray-900/5 rounded-md;

  .header {
    @apply border-b border-gray-200 bg-white px-4 py-5;

    h3 {
      @apply text-base font-medium text-gray-900;
    }
  }

  a, div {
    @apply font-medium flex justify-between items-center gap-x-6 px-4 py-5 hover:bg-gray-50 text-sm text-gray-800 cursor-pointer;
  }
}


label {
  @apply block text-xs font-semibold text-gray-900 uppercase mb-2
}

input {
  @apply block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6;
}

span {
  @apply mx-4 font-medium mb-4 text-gray-900
}

</style>
