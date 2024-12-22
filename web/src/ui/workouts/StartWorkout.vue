<script setup lang="ts">
import type { ExerciseSets } from '@/proto/api/v1/shared_pb'
import type { Routine } from '@/proto/api/v1/routine_service_pb'
import type { Set } from '@/types/workout'

import { DateTime } from 'luxon'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import router from '@/router/router'

import { useAlertStore } from '@/stores/alerts'
import { useWorkoutStore } from '@/stores/workout'
import { usePageTitleStore } from '@/stores/pageTitle'

import AppList from '@/ui/components/AppList.vue'
import AppButton from '@/ui/components/AppButton.vue'
import AppListItemInput from '@/ui/components/AppListItemInput.vue'
import { ChevronDownIcon, ChevronUpIcon, MinusCircleIcon } from '@heroicons/vue/24/outline'

import { createWorkout, getPreviousWorkoutSets, getRoutine } from '@/http/requests'
import { isNumber } from '@/utils/numbers.ts'

const route = useRoute()
const routineID = route.params.routine_id as string
const routine = ref<Routine | undefined>(undefined)
const prevExerciseSets = ref<ExerciseSets[]>([])
const startDateTime = ref(DateTime.now().toFormat("yyyy-MM-dd'T'HH:mm"))
const endDateTime = ref(DateTime.now().toFormat("yyyy-MM-dd'T'HH:mm"))

const workoutStore = useWorkoutStore()
const alertStore = useAlertStore()
const pageTitleStore = usePageTitleStore()

let dateTimeInterval: ReturnType<typeof setInterval>

onMounted(async () => {
  await initializeRoutine()
  startDateTimeUpdater()
})

onUnmounted(() => clearDateTimeUpdater())

const maxExerciseIndex = computed(() => {
  if (!routine.value?.exercises) return 0
  return routine.value.exercises.length - 1
})

const initializeRoutine = async () => {
  await fetchRoutine(routineID)
  await fetchPreviousExerciseSets()
  pageTitleStore.setPageTitle(routine.value?.name || 'Workout')
  workoutStore.initialiseWorkout(routineID)
  addEmptySetsFromPreviousSession()
}

const fetchRoutine = async (id: string) => {
  const res = await getRoutine(id)
  if (res) routine.value = res.routine
}

const fetchPreviousExerciseSets = async () => {
  const exerciseIds = routine.value?.exercises?.map((e) => e.id) || []
  const res = await getPreviousWorkoutSets(exerciseIds)
  if (res) prevExerciseSets.value = res.exerciseSets
}

const addEmptySetsFromPreviousSession = () => {
  routine.value?.exercises.forEach((exercise) =>
    workoutStore.addEmptySetIfNone(routineID, exercise.id),
  )

  prevExerciseSets.value.forEach((es) => {
    if (!es.exercise) return

    const missingSets = es.sets.length - workoutStore.getSets(routineID, es.exercise.id).length
    if (missingSets <= 0) return

    for (let i = 0; i < missingSets; i++) {
      workoutStore.addEmptySet(routineID, es.exercise.id)
    }
  })
}

const startDateTimeUpdater = () => {
  dateTimeInterval = setInterval(() => {
    endDateTime.value = DateTime.now().toFormat("yyyy-MM-dd'T'HH:mm")
  }, 1000)
}

const clearDateTimeUpdater = () => clearInterval(dateTimeInterval)

const prevSetWeight = (exerciseID: string, index: number) => {
  const prevSet = prevExerciseSets.value.find((set) => set.exercise?.id === exerciseID)?.sets[index]
  return prevSet?.weight?.toString()
}

const prevSetReps = (exerciseID: string, index: number) => {
  const prevSet = prevExerciseSets.value.find((set) => set.exercise?.id === exerciseID)?.sets[index]
  return prevSet?.reps?.toString()
}

const setPrevSetWeightIfEmpty = (event: Event, exerciseId: string, set: Set, index: number) => {
  if (isNumber(set.weight)) {
    return
  }
  const prevSet = workoutStore.getSets(routineID, exerciseId)[index - 1]
  if (prevSet == undefined) {
    return
  }

  set.weight = prevSet.weight
  const target = event.target as HTMLInputElement
  target.select()
  workoutStore.addEmptySetIfNone(routineID, exerciseId)
}

const setPrevSetRepIfEmpty = (event: Event, exerciseId: string, set: Set, index: number) => {
  if (isNumber(set.reps)) {
    return
  }
  const prevSet = workoutStore.getSets(routineID, exerciseId)[index - 1]
  if (prevSet == undefined) {
    return
  }

  set.reps = prevSet.reps
  const target = event.target as HTMLInputElement
  target.select()
  workoutStore.addEmptySetIfNone(routineID, exerciseId)
}

const onFinishWorkout = async () => {
  const exerciseSets = buildWorkoutSets()
  if (!exerciseSets) return

  const res = await createWorkout(
    routineID,
    exerciseSets,
    DateTime.fromISO(startDateTime.value),
    DateTime.fromISO(endDateTime.value),
  )

  if (res) {
    workoutStore.removeWorkout(routineID)
    alertStore.setSuccess('Workout saved')
    await router.push('/home')
  }
}

const buildWorkoutSets = () => {
  const allSets = workoutStore.getAllSets(routineID)
  if (!allSets) throw new Error('No exercise sets found')

  return routine.value?.exercises
    .map((exercise) => {
      const sets = allSets[exercise.id]?.filter((set) => isNumber(set.reps) && isNumber(set.weight))
      return sets?.length ? ({ exercise: { id: exercise.id }, sets } as ExerciseSets) : null
    })
    .filter(Boolean) as ExerciseSets[]
}

const cancelWorkout = async () => {
  if (confirm('Are you sure you want to cancel this workout?')) {
    workoutStore.removeWorkout(routineID)
    await router.push(`/routines/${routineID}`)
  }
}

const moveExercise = (index: number, direction: 'up' | 'down') => {
  const exercises = routine.value?.exercises
  if (!exercises) return

  const newIndex = direction === 'up' ? index - 1 : index + 1
  if (newIndex < 0 || newIndex >= exercises.length) return
  ;[exercises[index], exercises[newIndex]] = [exercises[newIndex], exercises[index]]
}
</script>

<template>
  <form @submit.prevent="onFinishWorkout">
    <div v-for="(exercise, index) in routine?.exercises" :key="exercise.id">
      <div class="flex justify-between pr-4">
        <h6>{{ exercise.name }}</h6>
        <div class="flex gap-x-1">
          <ChevronUpIcon
            v-if="index > 0"
            class="size-5 text-gray-500 cursor-pointer"
            @click="moveExercise(index, 'up')"
          />
          <ChevronDownIcon
            v-if="index < maxExerciseIndex"
            class="size-5 text-gray-500 cursor-pointer"
            @click="moveExercise(index, 'down')"
          />
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
            <tr v-if="workoutStore.getSets(routineID, exercise.id).length === 0">
              <td colspan="6">
                <AppButton
                  colour="primary"
                  type="button"
                  @click="workoutStore.addEmptySet(routineID, exercise.id)"
                >
                  Add Set
                </AppButton>
              </td>
            </tr>
            <tr v-for="(set, index) in workoutStore.getSets(routineID, exercise.id)" :key="index">
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
                  :required="isNumber(set.reps)"
                  @input="workoutStore.addEmptySetIfNone(routineID, exercise.id)"
                  @focus="setPrevSetWeightIfEmpty($event, exercise.id, set, index)"
                />
              </td>
              <td class="text-center">x</td>
              <td class="w-1/4">
                <input
                  v-model.number="set.reps"
                  type="text"
                  inputmode="numeric"
                  :required="isNumber(set.weight)"
                  @input="workoutStore.addEmptySetIfNone(routineID, exercise.id)"
                  @focus="setPrevSetRepIfEmpty($event, exercise.id, set, index)"
                />
              </td>
              <td>
                <div class="flex justify-center">
                  <MinusCircleIcon
                    class="cursor-pointer size-6 text-gray-900"
                    @click="workoutStore.deleteSet(routineID, exercise.id, index)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <h6>Start Time</h6>
    <AppList>
      <AppListItemInput
        :model="startDateTime"
        type="datetime-local"
        required
        @update="(value) => (startDateTime = value)"
      />
    </AppList>

    <h6>End Time</h6>
    <AppList>
      <AppListItemInput
        :model="endDateTime"
        type="datetime-local"
        required
        @update="(value) => (endDateTime = value)"
      />
    </AppList>

    <AppButton type="submit" colour="primary" class="mb-4">Finish Workout</AppButton>
    <AppButton type="button" colour="gray" @click="cancelWorkout">Cancel Workout</AppButton>
  </form>
</template>

<style scoped>
.table-container {
  @apply bg-white px-3 py-4 mb-4 border border-gray-200 rounded-md;
}

table {
  @apply w-full;
}

th {
  @apply text-left font-medium text-gray-900 px-1 pb-2;
}

input {
  @apply block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 font-medium;
}
</style>
