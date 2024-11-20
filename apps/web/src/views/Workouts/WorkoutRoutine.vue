<script setup lang="ts">
import Button from '@/components/Button.vue'
import { computed, onMounted, ref, type Ref, watch } from 'vue'
import { GetRoutineRequest, Routine } from '@/pb/api/v1/routines_pb'
import { RoutineClient } from '@/clients/clients'
import { useRoute } from 'vue-router'
import { ChevronRightIcon } from '@heroicons/vue/20/solid'
import { usePageTitleStore } from '@/stores/pageTitle'

const route = useRoute()
const pageTitleStore = usePageTitleStore()
const routine = ref<Routine | undefined>(undefined)

const fetchRoutine = async (id: string) => {
  const req = new GetRoutineRequest({ id })
  const res = await RoutineClient.get(req)
  routine.value = res.routine
}

type Set = {
  weight?: number
  reps?: number
}

const map: Ref<Map<string, Set[]>> = ref(new Map())

onMounted(async () => {
  console.log('route', route)
  await fetchRoutine(route.params.routine_id as string)
  pageTitleStore.setPageTitle(routine.value?.name as string)

  routine.value?.exercises.forEach((exercise) => {
    map.value.set(exercise.id, [{}])
  })
})

// watch(route, () => {
//   if (route.query.exercise_id) {
//     setExerciseID(route.query.exercise_id as string)
//   }
// })

watch(
  () => route.query.exercise_id,
  (exerciseID) => {
    console.log('exerciseID', exerciseID)
    console.log('exerciseID === typeof undefined', exerciseID === typeof undefined)
    if (exerciseID === typeof undefined) {
      console.log('clearing')
      clearExerciseID()
    } else {
      console.log('setting')
      setExerciseID(exerciseID as string)
    }
  },
)

// const setView = computed(() => {
//   return route.query.exercise_id && route.query.exercise_id.length > 0;
// })
// const setView = ref(false)
const exerciseID = ref('')

const setExerciseID = (id: string) => {
  exerciseID.value = id
  const exercise = routine.value?.exercises.find((exercise) => exercise.id === id)
  pageTitleStore.setPageTitle(exercise?.name as string)
}

const clearExerciseID = () => {
  exerciseID.value = ''
}

const hasExerciseID = computed(() => {
  // return route.query.exercise_id && route.query.exercise_id.length > 0
  return exerciseID.value.length > 0
})

const exerciseSets = computed(() => {
  return map.value.get(exerciseID.value)
})

const addSet = () => {
  const sets = map.value.get(exerciseID.value)
  sets?.push({})
}

const finishWorkout = () => {}

const areAllSetsFilled = (): boolean => {
  const sets = map.value.get(exerciseID.value) || []
  return sets.every((set) => set.weight !== undefined && set.reps !== undefined)
}

// Function to add a new set if all sets are filled
const addEmptySetIfNeeded = () => {
  if (areAllSetsFilled()) {
    addSet()
  }
}

const onWeightInput = (event: Event, set: Set) => {
  const value = (event.target as HTMLInputElement).value
  set.weight = value === '' ? undefined : parseFloat(value)
}

const onRepsInput = (event: Event, set: Set) => {
  const value = (event.target as HTMLInputElement).value
  set.reps = value === '' ? undefined : parseFloat(value)
}
</script>

<template>
  <form v-if="hasExerciseID">
    <div class="flex gap-x-10">
      <Button type="link" colour="primary" class="mb-6" :to="route.path">All Exercises</Button>
      <Button type="button" colour="primary" class="mb-6">Next Exercise</Button>
    </div>
    <div class="flex items-end mb-2" v-for="(set, index) in exerciseSets" :key="index">
      <div class="w-full">
        <label for="weight">Weight</label>
        <input
          id="weight"
          type="number"
          step="0.05"
          v-model.number="set.weight"
          @keyup="addEmptySetIfNeeded"
          @input="onWeightInput($event, set)"
        />
      </div>
      <span>x</span>
      <div class="w-full">
        <label for="reps">Reps</label>
        <input
          id="reps"
          type="number"
          step="1"
          v-model.number="set.reps"
          @keyup="addEmptySetIfNeeded"
          @input="onRepsInput($event, set)"
        />
      </div>
    </div>
    <Button type="button" colour="red" class="mt-6" @click="finishWorkout">Finish Workout</Button>
  </form>
  <ul v-else role="list">
    <li v-for="exercise in routine?.exercises" :key="exercise.id">
      <RouterLink :to="`/workouts/routine/${route.params.routine_id}/exercise/${exercise.id}`">
        {{ exercise.name }}
        <ChevronRightIcon class="size-5 flex-none text-gray-400" />
      </RouterLink>
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

  a,
  div {
    @apply font-medium flex justify-between items-center gap-x-6 px-4 py-5 hover:bg-gray-50 text-sm text-gray-800 cursor-pointer;
  }
}

label {
  @apply block text-xs font-semibold text-gray-900 uppercase mb-2;
}

input {
  @apply block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6;
}

span {
  @apply mx-4 font-medium mb-4 text-gray-900;
}
</style>
