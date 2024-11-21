<script setup lang="ts">
import Button from '@/components/Button.vue'
import { computed, onMounted, ref } from 'vue'
import { GetRoutineRequest, Routine } from '@/pb/api/v1/routines_pb'
import { RoutineClient, WorkoutClient } from '@/clients/clients'
import { useRoute } from 'vue-router'
import { ChevronRightIcon, ChevronDownIcon } from '@heroicons/vue/20/solid'
import { usePageTitleStore } from '@/stores/pageTitle'
import { useWorkoutStore } from '@/stores/workout'
import { CreateWorkoutRequest, ExerciseSets } from '@/pb/api/v1/workouts_pb'
import router from '@/router/router'
import { DateTime } from 'luxon'

const route = useRoute()
const date = ref(DateTime.now().toISODate())
const routine = ref<Routine | undefined>(undefined)
const routineID = route.params.routine_id as string
const workoutStore = useWorkoutStore()
const pageTitleStore = usePageTitleStore()

onMounted(async () => {
  await fetchRoutine(routineID)
  pageTitleStore.setPageTitle(routine.value?.name as string)
  workoutStore.initialiseWorkout(routineID)
  routine.value?.exercises.forEach((exercise) => {
    workoutStore.addEmptySetIfNone(routineID, exercise.id)
  })
})

const isCurrentExercise = (exerciseID: string) => {
  return exerciseID === route.query.exercise_id
}

const sets = computed(() => {
  return workoutStore.getSets(routineID, route.query.exercise_id as string)
})

const fetchRoutine = async (id: string) => {
  const req = new GetRoutineRequest({ id })
  const res = await RoutineClient.get(req)
  routine.value = res.routine
}

const finishWorkout = async () => {
  const exerciseSets = workoutStore.getAllSets(routineID)
  if (!exerciseSets) {
    throw new Error('No exercise sets found')
  }

  const eSetsList: ExerciseSets[] = []
  for (const [exerciseID, sets] of Object.entries(exerciseSets)) {
    const definedSets = sets.filter((set) => set.reps !== undefined && set.weight !== undefined)
    if (definedSets.length === 0) {
      continue
    }

    eSetsList.push(
      new ExerciseSets({
        exerciseId: exerciseID,
        sets: definedSets,
      }),
    )
  }

  const req = new CreateWorkoutRequest({
    routineId: routineID,
    exerciseSets: eSetsList,
  })
  await WorkoutClient.create(req)
  workoutStore.removeWorkout(routineID)
  await router.push(`/workouts`)
}
</script>

<template>
  <form class="space-y-6" @submit.prevent="finishWorkout">
    <div>
      <label class="block text-xs font-semibold text-gray-900 uppercase">Date</label>
      <div class="mt-2">
        <input
          v-model="date"
          type="datetime-local"
          required
          class="block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6"
        />
      </div>
    </div>
    <div>
      <label class="block text-xs font-semibold text-gray-900 uppercase">Exercises</label>
    <ul
      class="divide-y divide-gray-100 overflow-hidden bg-white shadow-sm ring-1 ring-gray-900/5 rounded-md"
      role="list"
    >
      <li v-for="exercise in routine?.exercises" :key="exercise.id">
        <RouterLink
          :to="`?exercise_id=${exercise.id}`"
          class="font-medium flex justify-between items-center gap-x-6 px-4 py-5 text-sm text-gray-800"
        >
          {{ exercise.name }}
          <ChevronDownIcon
            v-if="isCurrentExercise(exercise.id)"
            class="size-5 flex-none text-gray-400"
          />
          <ChevronRightIcon v-else class="size-5 flex-none text-gray-400" />
        </RouterLink>
        <div v-if="isCurrentExercise(exercise.id)" class="px-4">
          <div v-for="(set, index) in sets" :key="index">
            <label>Set {{ index + 1 }}</label>
            <div class="flex items-center gap-x-4 mb-4">
              <div class="w-full">
                <input
                  type="number"
                  step="0.05"
                  v-model.number="set.weight"
                  placeholder="Weight"
                  @keyup="
                    workoutStore.addEmptySetIfNone(routineID, route.query.exercise_id as string)
                  "
                />
              </div>
              <span class="text-gray-900 font-medium">x</span>
              <div class="w-full">
                <input
                  type="number"
                  step="1"
                  v-model.number="set.reps"
                  placeholder="Reps"
                  @keyup="
                    workoutStore.addEmptySetIfNone(routineID, route.query.exercise_id as string)
                  "
                />
              </div>
            </div>
          </div>
        </div>
      </li>
    </ul>
    </div>
    <Button type="submit" colour="primary" class="mt-6">
      Finish Workout
    </Button>
    <Button type="button" colour="red" class="mt-6">Discard Workout</Button>
  </form>
</template>

<style scoped>
label {
  @apply block text-xs font-semibold text-gray-900 uppercase mb-2;
}

input {
  @apply block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm;
}
</style>
