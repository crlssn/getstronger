<script setup lang="ts">
import Button from '@/components/Button.vue'
import {computed, onMounted, ref} from 'vue'
import {GetRoutineRequest} from '@/pb/api/v1/routines_pb'
import {ExerciseClient} from '@/clients/clients'
import {usePageTitleStore} from '@/stores/pageTitle'
import type {Exercise} from '@/pb/api/v1/exercise_pb'
import {useWorkoutStore} from "@/stores/workout";
import {useRoute} from "vue-router";

const pageTitleStore = usePageTitleStore()
const workoutStore = useWorkoutStore()
const route = useRoute()

const exercise = ref<Exercise | undefined>(undefined)

const routineID = ref(route.params.routine_id as string)
const exerciseID = ref(route.params.exercise_id as string)

const fetchExercise = async (id: string) => {
  const req = new GetRoutineRequest({id})
  const res = await ExerciseClient.get(req)
  exercise.value = res.exercise
}

onMounted(async () => {
  await fetchExercise(exerciseID.value)
  pageTitleStore.setPageTitle(exercise.value?.name as string)
  addEmptySetIfNone()
})

const addEmptySetIfNone = () => {
  workoutStore.addEmptySetIfNone(routineID.value, exerciseID.value)
}

const sets = computed(() => {
  const workout = workoutStore.getWorkout(routineID.value);
  return workout.exercise_sets?.[exerciseID.value] || [];
});
</script>

<template>
  <div class="flex gap-x-10">
    <Button type="link" colour="primary" class="mb-6" :to="`/workouts/routine/${routineID}`">All Exercises</Button>
    <Button type="button" colour="primary" class="mb-6">Next Exercise</Button>
  </div>
  <div class="flex items-end mb-2" v-for="(set, index) in sets" :key="index">
    <div class="w-full">
      <label for="weight">Weight</label>
      <input
        id="weight"
        type="number"
        step="0.05"
        v-model.number="set.weight"
        @keyup="addEmptySetIfNone"
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
        @keyup="addEmptySetIfNone"
      />
    </div>
  </div>
  <!--  <Button type="button" colour="red" class="mt-6" @click="finishWorkout">Finish Workout</Button>-->
</template>

<style scoped>
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
