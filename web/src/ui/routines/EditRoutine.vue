<script setup lang="ts">
import type { Exercise } from '@/proto/api/v1/shared_pb.ts'

import { onMounted, ref } from 'vue'
import { Switch } from '@headlessui/vue'
import {useRoute, useRouter} from "vue-router";
import {useAlertStore} from "@/stores/alerts.ts";
import AppButton from '@/ui/components/AppButton.vue'
import {getRoutine, listExercises, updateRoutine} from "@/http/requests.ts";

const name = ref('')
const exercises = ref(Array<Exercise>())
const exerciseIDs = ref(Array<string>())
const pageToken = ref(new Uint8Array(0))
const route = useRoute()
const router = useRouter()
const alertStore = useAlertStore()

onMounted(async () => {
  await fetchRoutine()
  await fetchExercises()
})

const fetchRoutine = async () => {
  const res = await getRoutine(route.params.id as string)
  if (!res) return

  name.value = res.routine?.name as string
  res.routine?.exercises.forEach((e) => exerciseIDs.value.push(e.id))
}

const fetchExercises = async () => {
  const res = await listExercises(pageToken.value)
  if (!res) return
  exercises.value = [...exercises.value, ...res.exercises]
  if (res.nextPageToken.length > 0) {
    pageToken.value = res.nextPageToken
    // TODO: Implement pagination.
    await fetchExercises()
  }
}

const toggleExercise = (id: string) => {
  if (exerciseIDs.value.includes(id)) {
    exerciseIDs.value = exerciseIDs.value.filter((e) => e !== id)
  } else {
    exerciseIDs.value.push(id)
  }
}

const onSubmit = async () => {
  const res = await updateRoutine(route.params.id as string, name.value, exerciseIDs.value)
  if (!res) return

  alertStore.setSuccess(`Updated ${name.value} routine`)
  await router.push('/routines')
}
</script>

<template>
  <form
    class="space-y-6"
    @submit.prevent="onSubmit"
  >
    <div>
      <label
        for="name"
        class="block text-xs font-semibold text-gray-900 uppercase"
      >Name</label>
      <div class="mt-2">
        <input
          v-model="name"
          type="text"
          required
          class="block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm"
        >
      </div>
    </div>

    <div>
      <label class="mb-2 block text-xs font-semibold text-gray-900 uppercase">Exercises</label>
      <ul
        role="list"
        class="divide-y divide-gray-100 overflow-hidden bg-white shadow-sm ring-1 ring-gray-900/5 rounded-md"
      >
        <li
          v-for="exercise in exercises"
          :key="exercise.id"
        >
          <div
            class="flex justify-between items-center gap-x-6 px-4 py-5 hover:bg-gray-50 sm:px-6m text-sm/6 text-gray-900"
          >
            {{ exercise.name }}
            <Switch
              :class="[
                exerciseIDs.includes(exercise.id) ? 'bg-indigo-600' : 'bg-gray-200',
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2',
              ]"
              @click="toggleExercise(exercise.id)"
            >
              <span
                :class="[
                  exerciseIDs.includes(exercise.id) ? 'translate-x-5' : 'translate-x-0',
                  'pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                ]"
              />
            </Switch>
          </div>
        </li>
      </ul>
    </div>

    <AppButton
      type="submit"
      colour="primary"
      class="mt-6"
    >
      Update Routine
    </AppButton>
  </form>
</template>
