<script setup lang="ts">
import Button from '@/components/Button.vue'
import { computed, onMounted, ref } from 'vue'
import { ExerciseClient, WorkoutClient } from '@/clients/clients'
import { usePageTitleStore } from '@/stores/pageTitle'
import { type Exercise, GetExerciseRequest } from '@/pb/api/v1/exercise_pb'
import { useWorkoutStore } from '@/stores/workout'
import { useRoute } from 'vue-router'
import { CreateWorkoutRequest, ExerciseSets } from '@/pb/api/v1/workouts_pb'
import router from "@/router/router";

const pageTitleStore = usePageTitleStore()
const workoutStore = useWorkoutStore()
const route = useRoute()

const exercise = ref<Exercise | undefined>(undefined)
const routineID = ref(route.params.routine_id as string)
const exerciseID = ref(route.params.exercise_id as string)

const fetchExercise = async (id: string) => {
  const req = new GetExerciseRequest({ id })
  const res = await ExerciseClient.get(req)
  exercise.value = res.exercise
}

onMounted(async () => {
  await fetchExercise(exerciseID.value)
  pageTitleStore.setPageTitle(exercise.value?.name as string)
  workoutStore.initialiseWorkout(routineID.value, exerciseID.value)
  workoutStore.addEmptySetIfNone(routineID.value, exerciseID.value)
})

const sets = computed(() => {
  return workoutStore.getSets(routineID.value, exerciseID.value)
})

const finishWorkout = async () => {
  const exerciseSets = workoutStore.getExerciseSets(routineID.value)
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
    routineId: routineID.value,
    exerciseSets: eSetsList,
  })
  const res = await WorkoutClient.create(req)

  workoutStore.removeWorkout(routineID.value)
  await router.push(`/workouts/${res.workoutId}`)
}
</script>

<template>
  <div class="flex gap-x-10">
    <Button type="link" colour="primary" class="mb-6" :to="`/workouts/routine/${routineID}`">
      All Exercises</Button>
    <Button type="button" colour="primary" class="mb-6">Next Exercise</Button>
  </div>
  <div v-for="(set, index) in sets" :key="index">
    <label>Set {{ index + 1 }}</label>
    <div class="flex items-center gap-x-4 mb-4">
      <div class="w-full">
        <input
          type="number"
          step="0.05"
          v-model.number="set.weight"
          placeholder="Weight"
          @keyup="workoutStore.addEmptySetIfNone(routineID, exerciseID)"
        />
      </div>
      <span class="text-gray-900 font-medium">x</span>
      <div class="w-full">
        <input
          type="number"
          step="1"
          v-model.number="set.reps"
          placeholder="Reps"
          @keyup="workoutStore.addEmptySetIfNone(routineID, exerciseID)"
        />
      </div>
    </div>
  </div>
  <Button type="button" colour="red" class="mt-6" @click="finishWorkout">Finish Workout</Button>
</template>

<style scoped>
label {
  @apply block text-xs font-semibold text-gray-900 uppercase mb-2;
}

input {
  @apply block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6;
}
</style>
