<script setup lang="ts">
import type {Exercise, ExerciseSets} from '@/proto/api/v1/shared_pb'

import {DateTime} from 'luxon'
import {useRoute} from 'vue-router'
import router from '@/router/router'
import {create} from '@bufbuild/protobuf'
import {onMounted, onUnmounted, ref} from 'vue'
import {createWorkout} from "@/http/requests.ts";
import {useAlertStore} from "@/stores/alerts.ts";
import {useWorkoutStore} from '@/stores/workout'
import AppList from "@/ui/components/AppList.vue";
import {usePageTitleStore} from '@/stores/pageTitle'
import AppButton from '@/ui/components/AppButton.vue'
import AppListItem from "@/ui/components/AppListItem.vue";
import {MinusCircleIcon} from '@heroicons/vue/24/outline'
import {ExerciseClient, RoutineClient} from '@/http/clients'
import AppListItemInput from "@/ui/components/AppListItemInput.vue";
import {GetPreviousWorkoutSetsRequestSchema} from '@/proto/api/v1/exercise_pb'
import {GetRoutineRequestSchema, type Routine} from '@/proto/api/v1/routines_pb'

const route = useRoute()
const routine = ref<Routine | undefined>(undefined)
const routineID = route.params.routine_id as string
const workoutStore = useWorkoutStore()
const pageTitleStore = usePageTitleStore()
const alertStore = useAlertStore()
const startDateTime = ref(DateTime.now().toFormat("yyyy-MM-dd'T'HH:mm"))
const endDateTime = ref(DateTime.now().toFormat("yyyy-MM-dd'T'HH:mm"))
let dateTimeInterval: ReturnType<typeof setInterval>
const prevExerciseSets = ref<ExerciseSets[]>([])

onMounted(async () => {
  await fetchRoutine(routineID)
  await fetchLatestExerciseSets()
  pageTitleStore.setPageTitle(routine.value?.name as string)
  workoutStore.initialiseWorkout(routineID)
  routine.value?.exercises.forEach((exercise) => {
    addEmptySetIfNone(exercise.id)
  })
  dateTimeInterval = setInterval(updateDateTime, 1000)
})

onUnmounted(() => {
  clearDateTimeInterval()
})

const fetchLatestExerciseSets = async () => {
  const req = create(GetPreviousWorkoutSetsRequestSchema, {
    exerciseIds: routine.value?.exercises?.map((exercise) => exercise.id) || [],
  })
  const res = await ExerciseClient.getPreviousWorkoutSets(req)
  prevExerciseSets.value = res.exerciseSets
}

const updateDateTime = () => {
  endDateTime.value = DateTime.now().toFormat("yyyy-MM-dd'T'HH:mm")
}

const clearDateTimeInterval = () => {
  console.log('clearing interval')
  clearInterval(dateTimeInterval)
}

const sets = (exerciseId: string) => {
  return workoutStore.getSets(routineID, exerciseId)
}

const fetchRoutine = async (id: string) => {
  const req = create(GetRoutineRequestSchema, {id})
  const res = await RoutineClient.get(req)
  routine.value = res.routine
}

const onFinishWorkout = async () => {
  const exerciseSets = workoutStore.getAllSets(routineID)
  if (!exerciseSets) {
    throw new Error('No exercise sets found')
  }

  const eSetsList: ExerciseSets[] = []
  for (const [exerciseID, sets] of Object.entries(exerciseSets)) {
    const definedSets = sets.filter((set) => isNumber(set.reps) && isNumber(set.weight))
    if (definedSets.length === 0) {
      continue
    }

    eSetsList.push({
      exercise: {
        id: exerciseID,
      } as Exercise,
      sets: definedSets,
    } as ExerciseSets)
  }

  const res = await createWorkout(routineID, eSetsList, DateTime.fromISO(startDateTime.value), DateTime.fromISO(endDateTime.value))
  if (!res) return

  workoutStore.removeWorkout(routineID)
  alertStore.setSuccess('Workout saved')
  await router.push('/home')
}

const cancelWorkout = async () => {
  if (confirm('Are you sure you want to cancel this workout?')) {
    workoutStore.removeWorkout(routineID)
    await router.push(`/routines/${routineID}`)
  }
}

const prevSetWeight = (exerciseID: string, index: number) => {
  const prevSet = prevExerciseSets.value.find((set) => set.exercise?.id === exerciseID)?.sets[index]
  return prevSet?.weight?.toString() || 'Weight'
}

const prevSetReps = (exerciseID: string, index: number) => {
  const prevSet = prevExerciseSets.value.find((set) => set.exercise?.id === exerciseID)?.sets[index]
  return prevSet?.reps?.toString() || 'Reps'
}

const isNumber = (value: number | string | undefined) => {
  return typeof value === 'number' && !Number.isNaN(value)
}

const addEmptySet = (exerciseID: string) => {
  workoutStore.addEmptySet(routineID, exerciseID)
}

const addEmptySetIfNone = (exerciseID: string) => {
  workoutStore.addEmptySetIfNone(routineID, exerciseID)
}

const deleteSet = (exerciseID: string, index: number) => {
  if (confirm('Are you sure you want to delete this set?')) {
    workoutStore.deleteSet(routineID, exerciseID, index)
  }
}

const setStartDateTime = (value: string) => {
  startDateTime.value = value
}

const setEndDateTime = (value: string) => {
  endDateTime.value = value
  clearDateTimeInterval()
}
</script>

<template>
  <form @submit.prevent="onFinishWorkout">
    <template
      v-for="exercise in routine?.exercises"
      :key="exercise.id"
    >
      <h6>{{ exercise.name }}</h6>
      <AppList>
        <AppListItem class="flex flex-col">
          <div
            v-for="(set, index) in sets(exercise.id)"
            :key="index"
            class="w-full"
          >
            <label>Set {{ index + 1 }}</label>
            <div class="flex items-center gap-x-4 mb-4">
              <div class="w-full">
                <input
                  v-model.number="set.weight"
                  type="text"
                  inputmode="decimal"
                  :placeholder="prevSetWeight(exercise.id, index)"
                  :required="sets(exercise.id).length > index + 1"
                  @keyup="addEmptySetIfNone(exercise.id)"
                >
              </div>
              <span class="text-gray-500 font-medium">x</span>
              <div class="w-full">
                <input
                  v-model.number="set.reps"
                  type="text"
                  inputmode="numeric"
                  :placeholder="prevSetReps(exercise.id, index)"
                  :required="sets(exercise.id).length > index + 1"
                  @keyup="addEmptySetIfNone(exercise.id)"
                >
              </div>
              <MinusCircleIcon
                class="cursor-pointer"
                @click="deleteSet(exercise.id, index)"
              />
            </div>
          </div>
          <AppButton
            colour="primary"
            type="button"
            class="w-full"
            @click="addEmptySet(exercise.id)"
          >
            Add Set
          </AppButton>
        </AppListItem>
      </AppList>
    </template>

    <h6>Start Time</h6>
    <AppList>
      <AppListItemInput
        :model="startDateTime"
        type="datetime-local"
        required
        @update="setStartDateTime"
      />
    </AppList>

    <h6>End Time</h6>
    <AppList>
      <AppListItemInput
        :model="endDateTime"
        type="datetime-local"
        required
        @update="setEndDateTime"
      />
    </AppList>

    <AppButton
      type="submit"
      colour="primary"
      container-class="px-4 pb-4"
    >
      Finish Workout
    </AppButton>
    <AppButton
      type="button"
      colour="gray"
      container-class="px-4 pb-4"
      @click="cancelWorkout"
    >
      Cancel Workout
    </AppButton>
  </form>
</template>

<style scoped>
label {
  @apply block text-sm font-semibold text-gray-600 uppercase mb-2;
}

input {
  @apply block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 font-medium;
}
</style>
