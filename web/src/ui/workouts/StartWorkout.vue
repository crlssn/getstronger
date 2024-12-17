<script setup lang="ts">
import type { Exercise, ExerciseSets } from '@/proto/api/v1/shared_pb'

import { DateTime } from 'luxon'
import { useRoute } from 'vue-router'
import router from '@/router/router'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useAlertStore } from '@/stores/alerts.ts'
import { useWorkoutStore } from '@/stores/workout'
import AppList from '@/ui/components/AppList.vue'
import { usePageTitleStore } from '@/stores/pageTitle'
import AppButton from '@/ui/components/AppButton.vue'
import { ChevronDownIcon, ChevronUpIcon, MinusCircleIcon } from '@heroicons/vue/24/outline'
import { type Routine } from '@/proto/api/v1/routine_service_pb'
import AppListItemInput from '@/ui/components/AppListItemInput.vue'
import { createWorkout, getPreviousWorkoutSets, getRoutine } from '@/http/requests.ts'

const route = useRoute()
const routine = ref<Routine | undefined>(undefined)
const routineID = route.params.routine_id as string
const workoutStore = useWorkoutStore()
const pageTitleStore = usePageTitleStore()
const alertStore = useAlertStore()
const startDateTime = ref(DateTime.now().toFormat('yyyy-MM-dd\'T\'HH:mm'))
const endDateTime = ref(DateTime.now().toFormat('yyyy-MM-dd\'T\'HH:mm'))
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
  const exerciseIds = routine.value?.exercises?.map((exercise) => exercise.id) || []
  const res = await getPreviousWorkoutSets(exerciseIds)
  if (!res) return

  prevExerciseSets.value = res.exerciseSets
}

const updateDateTime = () => {
  endDateTime.value = DateTime.now().toFormat('yyyy-MM-dd\'T\'HH:mm')
}

const clearDateTimeInterval = () => {
  console.log('clearing interval')
  clearInterval(dateTimeInterval)
}

const sets = (exerciseId: string) => {
  return workoutStore.getSets(routineID, exerciseId)
}

const fetchRoutine = async (id: string) => {
  const res = await getRoutine(id)
  if (!res) return

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
        id: exerciseID
      } as Exercise,
      sets: definedSets
    } as ExerciseSets)
  }

  const res = await createWorkout(
    routineID,
    eSetsList,
    DateTime.fromISO(startDateTime.value),
    DateTime.fromISO(endDateTime.value)
  )
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
  return prevSet?.weight?.toString()
}

const prevSetReps = (exerciseID: string, index: number) => {
  const prevSet = prevExerciseSets.value.find((set) => set.exercise?.id === exerciseID)?.sets[index]
  return prevSet?.reps?.toString()
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

const moveUp = (index: number) => {
  swapExercises(routine.value?.exercises, index, index - 1)
}

const moveDown = (index: number) => {
  swapExercises(routine.value?.exercises, index, index + 1)
}

const swapExercises = (exercises: Exercise[] | undefined, index1: number, index2: number) => {
  if (!exercises) return
  if (index1 < 0 || index2 < 0) return
  if (index1 > exercises.length - 1 || index2 > exercises.length - 1) return

  [exercises[index1], exercises[index2]] = [exercises[index2], exercises[index1]]
}

const maxExerciseIndex = computed(() => {
  if (!routine.value?.exercises) return 0
  return routine.value.exercises.length - 1 || 0
})
</script>

<template>
  <form @submit.prevent="onFinishWorkout">
    <div v-for="(exercise, index) in routine?.exercises" :key="exercise.id">
      <div class="flex justify-between pr-4">
        <h6>{{ exercise.name }}</h6>
        <div class="flex gap-x-1">
          <ChevronUpIcon class="size-5 text-gray-500 cursor-pointer" @click="moveUp(index)" v-if="index !== 0" />
          <ChevronDownIcon class="size-5  text-gray-500  cursor-pointer" @click="moveDown(index)" v-if="index !== maxExerciseIndex" />
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
          <tr>
            <th>Set</th>
            <th>Previous</th>
            <th>Weight</th>
            <th></th>
            <th>Reps</th>
            <th></th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(set, index) in sets(exercise.id)" :key="index">
            <td>{{ index + 1 }}</td>
            <td>
              <template
                v-if="prevSetWeight(exercise.id, index) && prevSetReps(exercise.id, index)"
              >
                {{ prevSetWeight(exercise.id, index) }} kg x {{ prevSetReps(exercise.id, index) }}
              </template>
            </td>
            <td class="w-1/4">
              <input
                v-model.number="set.weight"
                type="text"
                inputmode="decimal"
                :required="sets(exercise.id).length > index + 1"
                @keyup="addEmptySetIfNone(exercise.id)"
              />
            </td>
            <td class="text-center">x</td>
            <td class="w-1/4">
              <input
                v-model.number="set.reps"
                type="text"
                inputmode="numeric"
                :required="sets(exercise.id).length > index + 1"
                @keyup="addEmptySetIfNone(exercise.id)"
              />
            </td>
            <td>
              <MinusCircleIcon
                class="cursor-pointer size-6 text-gray-900"
                @click="deleteSet(exercise.id, index)"
              />
            </td>
          </tr>
          </tbody>
        </table>
        <AppButton colour="primary" type="button" class="w-full" @click="addEmptySet(exercise.id)">
          Add Set
        </AppButton>
      </div>
    </div>

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

    <AppButton type="submit" colour="primary" class="mb-4"> Finish Workout</AppButton>
    <AppButton type="button" colour="black" @click="cancelWorkout"> Cancel Workout</AppButton>
  </form>
</template>

<style scoped>
.table-container {
  @apply bg-white px-3 py-4  mb-4 border border-gray-200 rounded-md;
}

table {
  @apply w-full mb-4;

  th {
    @apply text-left font-medium text-gray-900 px-1 pb-2;
  }

  td {
    @apply text-nowrap px-1;
  }
}

input {
  @apply block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 font-medium;
}
</style>
