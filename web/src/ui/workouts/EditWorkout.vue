<script setup lang="ts">
import {DateTime} from 'luxon'
import {useRoute} from 'vue-router'
import router from '@/router/router'
import {onMounted, ref} from 'vue'
import {getWorkout, updateWorkout} from "@/http/requests.ts";
import {useAlertStore} from "@/stores/alerts.ts";
import AppList from "@/ui/components/AppList.vue";
import {usePageTitleStore} from '@/stores/pageTitle'
import AppButton from '@/ui/components/AppButton.vue'
import AppListItem from "@/ui/components/AppListItem.vue";
import {MinusCircleIcon} from '@heroicons/vue/24/outline'
import AppListItemInput from "@/ui/components/AppListItemInput.vue";
import type {Workout} from "@/proto/api/v1/workouts_pb.ts";
import type {Set} from "@/proto/api/v1/shared_pb";
import type {Timestamp} from "@bufbuild/protobuf/wkt";

const route = useRoute()
const workout = ref<Workout>()
const alertStore = useAlertStore()
const pageTitleStore = usePageTitleStore()

onMounted(async () => {
  await fetchWorkout(route.params.id as string)
  pageTitleStore.setPageTitle(workout.value?.name as string)
})

const fetchWorkout = async (id: string) => {
  const res = await getWorkout(id)
  if (!res) return

  workout.value = res.workout
}

const onUpdateWorkout = async () => {
  if (!workout.value) {
    return
  }

  const res = await updateWorkout(workout.value)
  if (!res) return

  alertStore.setSuccess('Workout updated')
  await router.push(`/workouts/${workout.value.id}`)
}

const addEmptySet = (exerciseId: string) => {
  if (!workout?.value) {
    return
  }

  workout.value.exerciseSets.find(es => es.exercise?.id === exerciseId)?.sets.push({} as Set)
}

const deleteSet = (exerciseId: string, index: number) => {
  if (!workout?.value) {
    return
  }

  if (confirm('Are you sure you want to delete this set?')) {
    workout.value.exerciseSets.find(es => es.exercise?.id === exerciseId)?.sets.splice(index, 1)
  }
}

const setStartDateTime = (value: string) => {
  workout.value = {
    ...workout.value,
    createdAt: {
      seconds: BigInt(DateTime.fromISO(value).toSeconds())
    } as Timestamp
  } as Workout
}

const setEndDateTime = (value: string) => {
  workout.value = {
    ...workout.value,
    finishedAt: {
      seconds: BigInt(DateTime.fromISO(value).toSeconds())
    } as Timestamp
  } as Workout
}

const toDateTime = (timestamp: Timestamp|undefined) => {
  if (!timestamp) {
    return DateTime.now().toFormat("yyyy-MM-dd'T'HH:mm")
  }

  return DateTime.fromSeconds(Number(timestamp.seconds)).toFormat("yyyy-MM-dd'T'HH:mm")
}
</script>

<template>
  <form @submit.prevent="onUpdateWorkout">
    <template
      v-for="es in workout?.exerciseSets"
      :key="es.exercise?.id"
    >
      <h6>{{ es.exercise?.name }}</h6>
      <AppList>
        <AppListItem class="flex flex-col">
          <div
            v-for="(set, index) in es.sets"
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
                  placeholder="Weight"
                  :required="es.sets.length > index + 1"
                >
              </div>
              <span class="text-gray-500 font-medium">x</span>
              <div class="w-full">
                <input
                  v-model.number="set.reps"
                  type="text"
                  inputmode="numeric"
                  placeholder="Reps"
                  :required="es.sets.length > index + 1"
                >
              </div>
              <MinusCircleIcon
                class="cursor-pointer"
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
        :model="toDateTime(workout?.createdAt)"
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

    <AppButton
      type="submit"
      colour="primary"
      container-class="px-4 pb-4"
    >
      Update Workout
    </AppButton>
    <AppButton
      type="link"
      :to="`/workouts/${workout?.id}`"
      colour="gray"
      container-class="px-4 pb-4"
    >
      Cancel Update
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
