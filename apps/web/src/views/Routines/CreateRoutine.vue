<script setup lang="ts">
import AppButton from '@/components/AppButton.vue'
import { onMounted, ref } from 'vue'
import { ExerciseClient, RoutineClient } from '@/clients/clients'
import { CreateRoutineRequest } from '@/pb/api/v1/routines_pb'
import { Exercise, ListExercisesRequest } from '@/pb/api/v1/exercise_pb'
import { ConnectError } from '@connectrpc/connect'
import { Switch } from '@headlessui/vue'

const name = ref('')
const exercises = ref(Array<Exercise>())
const exerciseIDs = ref(Array<string>())
const pageToken = ref(new Uint8Array(0))
const resOK = ref(false)
const resError = ref('')

const toggleExercise = (id: string) => {
  if (exerciseIDs.value.includes(id)) {
    exerciseIDs.value = exerciseIDs.value.filter((e) => e !== id)
    return
  }

  exerciseIDs.value.push(id)
}

const fetchExercises = async () => {
  try {
    const req = new ListExercisesRequest({
      pageToken: pageToken.value,
      pageSize: 100,
    })
    const res = await ExerciseClient.list(req)
    exercises.value = [...exercises.value, ...res.exercises]
    if (res.nextPageToken.length > 0) {
      pageToken.value = res.nextPageToken
      // TODO: Implement pagination.
      await fetchExercises()
    }
  } catch (error) {
    resOK.value = false
    if (error instanceof ConnectError) {
      resError.value = error.message
      return
    }
    console.error('exercise fetch failed:', error)
  }
}

const createRoutine = async () => {
  try {
    const req = new CreateRoutineRequest({
      name: name.value,
      exerciseIds: exerciseIDs.value,
    })
    await RoutineClient.create(req)
    resOK.value = true
    resError.value = ''
    name.value = ''
    exerciseIDs.value = []
  } catch (error) {
    resOK.value = false
    if (error instanceof ConnectError) {
      resError.value = error.message
      return
    }
    console.error('create routine failed:', error)
  }
}

onMounted(() => {
  fetchExercises()
})
</script>

<template>
  <div
    v-if="resOK"
    class="border-2 border-green-400 bg-green-300 rounded-md py-3 px-5 mb-4 text-sm text-green-800 font-medium"
    role="alert"
  >
    Your new routine has been created successfully.
  </div>

  <div
    v-if="resError"
    class="border-2 border-red-400 bg-red-300 mb-4 rounded-md py-3 px-5 text-sm text-red-800"
    role="alert"
  >
    {{ resError }}
  </div>

  <form class="space-y-6" @submit.prevent="createRoutine">
    <div>
      <label for="name" class="block text-xs font-semibold text-gray-900 uppercase">Name</label>
      <div class="mt-2">
        <input
          v-model="name"
          type="text"
          required
          class="block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6"
        />
      </div>
    </div>

    <div>
      <label class="mb-2 block text-xs font-semibold text-gray-900 uppercase">Exercises</label>
      <ul
        role="list"
        class="divide-y divide-gray-100 overflow-hidden bg-white shadow-sm ring-1 ring-gray-900/5 rounded-md"
      >
        <li v-for="exercise in exercises" :key="exercise.id">
          <div
            class="flex justify-between items-center gap-x-6 px-4 py-5 hover:bg-gray-50 sm:px-6m text-sm/6 text-gray-900"
          >
            {{ exercise.name }}
            <Switch
              @click="toggleExercise(exercise.id)"
              :class="[
                exerciseIDs.includes(exercise.id) ? 'bg-indigo-600' : 'bg-gray-200',
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2',
              ]"
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

    <AppButton type="submit" colour="primary" class="mt-6">Save Routine</AppButton>
  </form>
</template>
