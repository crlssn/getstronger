<script setup lang="ts">
import { timestampFromDate, type Timestamp } from '@bufbuild/protobuf/wkt'
import type { Workout } from '@/proto/api/v1/workout_service_pb'
import type { ExerciseSets, Set } from '@/proto/api/v1/shared_pb'

import { DateTime } from 'luxon'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import router from '@/router/router'
import { useAuthStore } from '@/stores/auth.ts'
import { useAlertStore } from '@/stores/alerts.ts'
import AppList from '@/ui/components/AppList.vue'
import { usePageTitleStore } from '@/stores/pageTitle'
import AppButton from '@/ui/components/AppButton.vue'
import AppListItem from '@/ui/components/AppListItem.vue'
import { ChevronDownIcon, ChevronUpIcon, MinusCircleIcon } from '@heroicons/vue/24/outline'
import { getWorkout, updateWorkout } from '@/http/requests.ts'
import AppListItemInput from '@/ui/components/AppListItemInput.vue'
import ExerciseTags from '@/ui/exercises/ExerciseTags.vue'
import DurationInput from '@/ui/workouts/DurationInput.vue'
import {
  hasAnyExerciseSetValue,
  isExerciseSetComplete,
  measurementsForExercise,
} from '@/utils/exerciseMeasurements'

const route = useRoute()
const workout = ref<Workout>()
const alertStore = useAlertStore()
const authStore = useAuthStore()
const pageTitleStore = usePageTitleStore()

onMounted(async () => {
  await fetchWorkout(route.params.id as string)
  pageTitleStore.setPageTitle(workout.value?.name as string)
})

const fetchWorkout = async (id: string) => {
  const res = await getWorkout(id)
  if (!res) return

  if (res.workout?.user?.id !== authStore.userId) {
    alertStore.setError('You do not have permission to edit this workout')
    await router.push('/home')
    return
  }

  workout.value = res.workout
}

const onUpdateWorkout = async () => {
  if (!workout.value) {
    return
  }

  workout.value.exerciseSets = workout.value.exerciseSets
    .map((exerciseSet) => {
      const sets = exerciseSet.sets.filter((set) => isExerciseSetComplete(set, exerciseSet.exercise))
      if (!sets.length) return null
      exerciseSet.sets = sets
      return exerciseSet
    })
    .filter(Boolean) as ExerciseSets[]

  const res = await updateWorkout(workout.value)
  if (!res) return

  alertStore.setSuccess('Workout updated')
  await router.push(`/workouts/${workout.value.id}`)
}

const addEmptySet = (exerciseId: string) => {
  if (!workout?.value) {
    return
  }

  workout.value.exerciseSets
    .find((es: ExerciseSets) => es.exercise?.id === exerciseId)
    ?.sets.push({
      $typeName: 'api.v1.Set',
    } as Set)
}

const deleteSet = (exerciseId: string, index: number) => {
  if (!workout?.value) {
    return
  }

  workout.value.exerciseSets
    .find((es: ExerciseSets) => es.exercise?.id === exerciseId)
    ?.sets.splice(index, 1)
}

const setStartDateTime = (value: string) => {
  workout.value = {
    ...workout.value,
    startedAt: timestampFromDate(DateTime.fromISO(value).toJSDate()),
  } as Workout
}

const setEndDateTime = (value: string) => {
  workout.value = {
    ...workout.value,
    finishedAt: timestampFromDate(DateTime.fromISO(value).toJSDate()),
  } as Workout
}

const toDateTime = (timestamp: Timestamp | undefined) => {
  if (!timestamp) {
    return DateTime.now().toFormat("yyyy-MM-dd'T'HH:mm")
  }

  return DateTime.fromSeconds(Number(timestamp.seconds)).toFormat("yyyy-MM-dd'T'HH:mm")
}

const maxExerciseIndex = computed(() => {
  if (!workout.value?.exerciseSets) return 0
  return workout.value.exerciseSets.length - 1
})

const moveExercise = (index: number, direction: 'up' | 'down') => {
  const exercises = workout.value?.exerciseSets
  if (!exercises) return

  const newIndex = direction === 'up' ? index - 1 : index + 1
  if (newIndex < 0 || newIndex >= exercises.length) return
  ;[exercises[index], exercises[newIndex]] = [exercises[newIndex], exercises[index]]
}
</script>

<template>
  <form class="edit-workout-form" @submit.prevent="onUpdateWorkout">
    <template v-for="(es, index) in workout?.exerciseSets" :key="es.exercise?.id">
      <div class="flex justify-between pr-4">
        <div>
          <h6>{{ es.exercise?.name }}</h6>
          <ExerciseTags compact :tags="es.exercise?.tags" />
        </div>
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

      <AppList>
        <AppListItem class="flex flex-col">
          <div v-for="(set, index) in es.sets" :key="index" class="w-full">
            <label>Set {{ index + 1 }}</label>
            <div
              class="measurement-row"
              :style="{ '--metric-count': measurementsForExercise(es.exercise).length }"
            >
              <div
                v-for="measurement in measurementsForExercise(es.exercise)"
                :key="measurement.field"
                class="measurement-input"
              >
                <span>{{ measurement.label }}</span>
                <DurationInput
                  v-if="measurement.field === 'durationSeconds'"
                  v-model="set.durationSeconds"
                  :required="hasAnyExerciseSetValue(set, es.exercise)"
                />
                <input
                  v-else
                  v-model.number="set[measurement.field]"
                  type="number"
                  :inputmode="measurement.inputmode"
                  min="0"
                  :step="measurement.field === 'reps' ? 1 : 'any'"
                  :placeholder="measurement.label"
                  :required="hasAnyExerciseSetValue(set, es.exercise)"
                />
              </div>
              <MinusCircleIcon
                class="remove-set"
                @click="deleteSet(es.exercise?.id as string, index)"
              />
            </div>
          </div>
          <AppButton
            colour="primary"
            type="button"
            class="w-full"
            @click="addEmptySet(es.exercise?.id as string)"
          >
            Add Set
          </AppButton>
        </AppListItem>
      </AppList>
    </template>

    <h6>Start Time</h6>
    <AppList>
      <AppListItemInput
        :model="toDateTime(workout?.startedAt)"
        type="datetime-local"
        required
        @update="setStartDateTime"
      />
    </AppList>

    <h6>End Time</h6>
    <AppList>
      <AppListItemInput
        :model="toDateTime(workout?.finishedAt)"
        type="datetime-local"
        required
        @update="setEndDateTime"
      />
    </AppList>

    <h6>Note</h6>
    <textarea
      v-if="workout"
      ref="textarea"
      v-model="workout.note"
      class="w-full border-gray-200 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-base min-h-20 py-3 mb-4 resize-none overflow-hidden"
      placeholder="How was it?"
    />

    <footer class="update-dock">
      <AppButton type="submit" colour="primary">Update Workout</AppButton>
      <AppButton type="link" :to="`/workouts/${workout?.id}`" colour="gray">
        Cancel Update
      </AppButton>
    </footer>
  </form>
</template>

<style scoped>
.edit-workout-form {
  @apply pb-32;
}

.update-dock {
  padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
  @apply fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-3xl flex-col items-stretch gap-2 border-t border-slate-200 bg-white px-4 pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] sm:bottom-4 sm:rounded-2xl sm:border sm:pb-3;
}

label {
  @apply block text-sm font-semibold text-gray-600 uppercase mb-2;
}

input {
  @apply block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 font-medium;
}

.measurement-row {
  grid-template-columns: repeat(var(--metric-count), minmax(0, 1fr)) auto;
  @apply mb-4 grid items-end gap-3;
}

.measurement-input > span {
  @apply mb-1 block text-xs font-semibold text-slate-500;
}

.remove-set {
  @apply mb-3 size-7 cursor-pointer text-slate-500;
}

@media (max-width: 520px) {
  .measurement-row {
    @apply gap-2;
  }
}
</style>
