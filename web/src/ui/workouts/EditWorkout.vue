<script setup lang="ts">
import { timestampFromDate, type Timestamp } from '@bufbuild/protobuf/wkt'
import type { Workout } from '@/proto/api/v1/workout_service_pb'
import type { ExerciseSets, Set } from '@/proto/api/v1/shared_pb'

import { DateTime } from 'luxon'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import router from '@/router/router'
import { useAuthStore } from '@/stores/auth.ts'
import { useAlertStore } from '@/stores/alerts.ts'
import AppList from '@/ui/components/AppList.vue'
import { usePageTitleStore } from '@/stores/pageTitle'
import AppButton from '@/ui/components/AppButton.vue'
import AppOptionalAction from '@/ui/components/AppOptionalAction.vue'
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
import { normalizeWeightUnit, weightUnitLabel } from '@/utils/weightUnits'
import { normalizeDistanceUnit, distanceUnitLabel } from '@/utils/distanceUnits'

const { t } = useI18n()
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
    alertStore.setError(t('workout.edit.noPermission'))
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
      const sets = exerciseSet.sets.filter((set) =>
        isExerciseSetComplete(set, exerciseSet.exercise),
      )
      if (!sets.length) return null
      exerciseSet.sets = sets
      return exerciseSet
    })
    .filter(Boolean) as ExerciseSets[]

  const res = await updateWorkout(workout.value)
  if (!res) return

  alertStore.setSuccess(t('workout.edit.updated'))
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
      weightUnit: normalizeWeightUnit(workout.value.user?.weightUnit),
      distanceUnit: normalizeDistanceUnit(workout.value.user?.distanceUnit),
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
  <AppSkeleton v-if="!workout" />
  <form v-else class="edit-workout-form" @submit.prevent="onUpdateWorkout">
    <template v-for="(es, index) in workout?.exerciseSets" :key="es.exercise?.id">
      <div class="flex justify-between pr-4">
        <div>
          <h6>{{ es.exercise?.name }}</h6>
          <ExerciseTags compact :tags="es.exercise?.tags" />
        </div>
        <div class="flex gap-x-1">
          <ChevronUpIcon
            v-if="index > 0"
            class="size-5 text-text-subtle cursor-pointer"
            @click="moveExercise(index, 'up')"
          />
          <ChevronDownIcon
            v-if="index < maxExerciseIndex"
            class="size-5 text-text-subtle cursor-pointer"
            @click="moveExercise(index, 'down')"
          />
        </div>
      </div>

      <AppList>
        <AppListItem class="flex flex-col">
          <div v-for="(set, index) in es.sets" :key="index" class="w-full">
            <label>{{ t('common.set') }} {{ index + 1 }}</label>
            <div
              class="measurement-row"
              :style="{ '--metric-count': measurementsForExercise(es.exercise).length }"
            >
              <div
                v-for="measurement in measurementsForExercise(es.exercise)"
                :key="measurement.field"
                class="measurement-input"
              >
                <span>{{ t(measurement.labelKey) }}</span>
                <DurationInput
                  v-if="measurement.field === 'durationSeconds'"
                  v-model="set.durationSeconds"
                  :required="hasAnyExerciseSetValue(set, es.exercise)"
                />
                <div v-else-if="measurement.field === 'weight'" class="flex items-center gap-2">
                  <input
                    v-model.number="set.weight"
                    type="number"
                    inputmode="decimal"
                    min="0"
                    step="any"
                    :placeholder="t(measurement.labelKey)"
                    :required="hasAnyExerciseSetValue(set, es.exercise)"
                  />
                  <span class="unit-suffix">{{ weightUnitLabel(set.weightUnit) }}</span>
                </div>
                <div v-else-if="measurement.field === 'distance'" class="flex items-center gap-2">
                  <input
                    v-model.number="set.distance"
                    type="number"
                    inputmode="decimal"
                    min="0"
                    step="any"
                    :placeholder="t(measurement.labelKey)"
                    :required="hasAnyExerciseSetValue(set, es.exercise)"
                  />
                  <span class="unit-suffix">{{ distanceUnitLabel(set.distanceUnit) }}</span>
                </div>
                <input
                  v-else
                  v-model.number="set[measurement.field]"
                  type="number"
                  :inputmode="measurement.inputmode"
                  min="0"
                  :step="measurement.field === 'reps' ? 1 : 'any'"
                  :placeholder="t(measurement.labelKey)"
                  :required="hasAnyExerciseSetValue(set, es.exercise)"
                />
              </div>
              <MinusCircleIcon
                class="remove-set"
                @click="deleteSet(es.exercise?.id as string, index)"
              />
            </div>
          </div>
          <AppOptionalAction
            :label="t('workout.edit.addSet')"
            @click="addEmptySet(es.exercise?.id as string)"
          />
        </AppListItem>
      </AppList>
    </template>

    <h6>{{ t('workout.edit.startTime') }}</h6>
    <AppList>
      <AppListItemInput
        :model="toDateTime(workout?.startedAt)"
        type="datetime-local"
        required
        @update="setStartDateTime"
      />
    </AppList>

    <h6>{{ t('workout.edit.endTime') }}</h6>
    <AppList>
      <AppListItemInput
        :model="toDateTime(workout?.finishedAt)"
        type="datetime-local"
        required
        @update="setEndDateTime"
      />
    </AppList>

    <h6>{{ t('workout.edit.note') }}</h6>
    <textarea
      v-if="workout"
      ref="textarea"
      v-model="workout.note"
      class="w-full border-border rounded-control focus:ring-ink-muted focus:border-ink-muted text-base min-h-20 py-3 mb-4 resize-none overflow-hidden"
      :placeholder="t('workout.notePlaceholder')"
    />

    <footer class="update-dock">
      <AppButton type="submit" colour="primary">{{ t('workout.edit.submit') }}</AppButton>
      <AppButton type="link" :to="`/workouts/${workout?.id}`" colour="secondary">
        {{ t('common.cancel') }}
      </AppButton>
    </footer>
  </form>
</template>

<style scoped>
@reference '../../assets/base.css';

.edit-workout-form {
  @apply pb-32;
}

.update-dock {
  bottom: calc(4.5rem + env(safe-area-inset-bottom));
  @apply fixed inset-x-0 z-40 mx-auto flex max-w-3xl flex-col items-stretch gap-2 border-t border-border bg-white px-4 py-3 shadow-overlay sm:rounded-card sm:border;
}

label {
  @apply block text-sm font-semibold text-text-muted uppercase mb-2;
}

input {
  @apply block w-full rounded-control border-0 bg-white px-3 py-3 text-text shadow-card ring-1 ring-inset ring-ink-border placeholder:text-text-subtle focus:ring-2 focus:ring-inset focus:ring-ink font-medium;
}

.measurement-row {
  grid-template-columns: repeat(var(--metric-count), minmax(0, 1fr)) auto;
  @apply mb-4 grid items-end gap-3;
}

.measurement-input > span {
  @apply mb-1 block text-xs font-semibold text-text-subtle;
}

.remove-set {
  @apply mb-3 size-7 cursor-pointer text-text-subtle;
}

.unit-suffix {
  @apply shrink-0 text-eyebrow font-bold uppercase text-text-subtle;
}

@media (max-width: 520px) {
  .measurement-row {
    @apply gap-2;
  }
}
</style>
