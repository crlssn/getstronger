<script setup lang="ts">
import AppButton from '@/components/AppButton.vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { GetRoutineRequest, Routine } from '@/pb/api/v1/routines_pb'
import { RoutineClient, WorkoutClient } from '@/clients/clients'
import { useRoute } from 'vue-router'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/vue/20/solid'
import { usePageTitleStore } from '@/stores/pageTitle'
import { useWorkoutStore } from '@/stores/workout'
import { CreateWorkoutRequest, GetLatestExerciseSetsRequest } from '@/pb/api/v1/workouts_pb'
import router from '@/router/router'
import { DateTime } from 'luxon'
import { Timestamp } from '@bufbuild/protobuf'
import { ConnectError } from '@connectrpc/connect'
import { ExerciseSets } from '@/pb/api/v1/shared_pb'

const route = useRoute()
const routine = ref<Routine | undefined>(undefined)
const routineID = route.params.routine_id as string
const workoutStore = useWorkoutStore()
const pageTitleStore = usePageTitleStore()
const dateTime = ref(DateTime.now().toFormat("yyyy-MM-dd'T'HH:mm"))
let dateTimeInterval: ReturnType<typeof setInterval>
const reqError = ref('')
const prevExerciseSets = ref<ExerciseSets[]>([])

onMounted(async () => {
  await fetchRoutine(routineID)
  await fetchLatestExerciseSets()
  pageTitleStore.setPageTitle(routine.value?.name as string)
  workoutStore.initialiseWorkout(routineID)
  routine.value?.exercises.forEach((exercise) => {
    workoutStore.addEmptySetIfNone(routineID, exercise.id)
  })
  dateTimeInterval = setInterval(updateDateTime, 1000)
})

onUnmounted(() => {
  clearDateTimeInterval()
})

const fetchLatestExerciseSets = async () => {
  const req = new GetLatestExerciseSetsRequest({
    exerciseIds: routine.value?.exercises?.map((exercise) => exercise.id) || [],
  })
  const res = await WorkoutClient.getLatestExerciseSets(req)
  prevExerciseSets.value = res.exerciseSets
}

const updateDateTime = () => {
  dateTime.value = DateTime.now().toFormat("yyyy-MM-dd'T'HH:mm")
}

const clearDateTimeInterval = () => {
  clearInterval(dateTimeInterval)
}

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
    const definedSets = sets
      .filter((set) => set.reps !== undefined && set.weight !== undefined)
      .filter((set) => set.reps !== '' && set.weight !== '')
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

  try {
    await WorkoutClient.create(
      new CreateWorkoutRequest({
        routineId: routineID,
        exerciseSets: eSetsList,
        finishedAt: new Timestamp({
          seconds: BigInt(DateTime.fromISO(dateTime.value).toSeconds()),
        }),
      }),
    )
  } catch (error) {
    if (error instanceof ConnectError) {
      reqError.value = error.message
      return
    }
    console.error(error)
  }

  workoutStore.removeWorkout(routineID)
  await router.push(`/workouts`)
}

const cancelWorkout = async () => {
  workoutStore.removeWorkout(routineID)
  await router.push(`/routines/${routineID}`)
}

const prevSetWeight = (exerciseID: string, index: number) => {
  const prevSet = prevExerciseSets.value.find((set) => set.exerciseId === exerciseID)?.sets[index]
  return prevSet?.weight?.toString() || 'Weight'
}

const prevSetReps = (exerciseID: string, index: number) => {
  const prevSet = prevExerciseSets.value.find((set) => set.exerciseId === exerciseID)?.sets[index]
  return prevSet?.reps?.toString() || 'Reps'
}
</script>

<template>
  <div
    v-if="reqError"
    class="border-2 border-red-400 bg-red-300 mb-4 rounded-md py-3 px-5 text-sm text-red-800"
    role="alert"
  >
    {{ reqError }}
  </div>
  <form class="space-y-6" @submit.prevent="finishWorkout">
    <div>
      <label class="block text-xs font-semibold text-gray-900 uppercase">Exercises</label>
      <ul
        class="divide-y divide-gray-100 overflow-hidden bg-white shadow-sm ring-1 ring-gray-900/5 rounded-md"
        role="list"
      >
        <li v-for="exercise in routine?.exercises" :key="exercise.id">
          <RouterLink
            :to="isCurrentExercise(exercise.id) ? '' : `?exercise_id=${exercise.id}`"
            class="font-medium flex justify-between items-center gap-x-6 px-4 py-5 text-sm text-gray-800"
            :class="isCurrentExercise(exercise.id) && 'font-semibold'"
          >
            {{ exercise.name }}
            <ChevronDownIcon
              v-if="isCurrentExercise(exercise.id)"
              class="size-5 flex-none text-gray-600"
            />
            <ChevronRightIcon v-else class="size-5 flex-none text-gray-400" />
          </RouterLink>
          <div v-if="isCurrentExercise(exercise.id)" class="px-4">
            <div v-for="(set, index) in sets" :key="index">
              <label>Set {{ index + 1 }}</label>
              <div class="flex items-center gap-x-4 mb-4">
                <div class="w-full">
                  <input
                    type="text"
                    inputmode="decimal"
                    v-model.number="set.weight"
                    :placeholder="prevSetWeight(exercise.id, index)"
                    @keyup="
                      workoutStore.addEmptySetIfNone(routineID, route.query.exercise_id as string)
                    "
                  />
                </div>
                <span class="text-gray-900 font-medium">x</span>
                <div class="w-full">
                  <input
                    type="text"
                    inputmode="numeric"
                    v-model.number="set.reps"
                    :placeholder="prevSetReps(exercise.id, index)"
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
    <div>
      <label class="block text-xs font-semibold text-gray-900 uppercase">Date</label>
      <div class="mt-2">
        <input
          v-model="dateTime"
          type="datetime-local"
          @input="clearDateTimeInterval"
          required
          class="block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6"
        />
      </div>
    </div>
    <AppButton type="submit" colour="primary" class="mt-6">Finish Workout</AppButton>
    <AppButton type="button" colour="gray" class="mt-6" @click="cancelWorkout"
      >Cancel Workout</AppButton
    >
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
