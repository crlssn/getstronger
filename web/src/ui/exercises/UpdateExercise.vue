<script setup lang="ts">
import { GetExerciseRequestSchema, UpdateExerciseRequestSchema } from '@/proto/api/v1/exercise_pb'
import type { FieldMask } from '@bufbuild/protobuf/wkt'
import AppButton from '@/ui/components/AppButton.vue'
import { onMounted, ref } from 'vue'
import { ExerciseClient } from '@/clients/clients'
import { ConnectError } from '@connectrpc/connect'
import { useRoute } from 'vue-router'
import { create } from '@bufbuild/protobuf'
import type { Exercise } from '@/proto/api/v1/shared_pb.ts' // import { FieldMask } from '@bufbuild/protobuf'

const name = ref('')
const label = ref('')
const resError = ref('')
const resOK = ref(false)

const route = useRoute()

async function loadExercise() {
  const request = create(GetExerciseRequestSchema, {
    id: route.params.id as string,
  })
  try {
    const response = await ExerciseClient.get(request)
    if (typeof response.exercise === 'undefined') {
      return
    }
    name.value = response.exercise.name
    label.value = response.exercise.label
  } catch (error) {
    resOK.value = false
    if (error instanceof ConnectError) {
      resError.value = error.message
      return
    }
    console.error('create exercise failed:', error)
  }
}

onMounted(() => {
  loadExercise()
})

async function updateExercise() {
  const request = create(UpdateExerciseRequestSchema, {
    exercise: {
      id: route.params.id as string,
      name: name.value,
      label: label.value,
    } as Exercise,
    updateMask: {
      paths: ['name', 'label'],
    } as FieldMask,
  })
  try {
    await ExerciseClient.update(request)
    resOK.value = true
    resError.value = ''
  } catch (error) {
    resOK.value = false
    if (error instanceof ConnectError) {
      resError.value = error.message
      return
    }
    console.error('create exercise failed:', error)
  }
}
</script>

<template>
  <div class="">
    <div
      v-if="resOK"
      class="border-2 border-green-400 bg-green-300 rounded-md py-3 px-5 mb-4 text-sm text-green-800 font-medium"
      role="alert"
    >
      Exercise updated successfully.
    </div>
    <div
      v-if="resError"
      class="border-2 border-red-400 bg-red-300 mb-4 rounded-md py-3 px-5 mb-2 text-sm text-red-800"
      role="alert"
    >
      {{ resError }}
    </div>
    <form class="space-y-6" @submit.prevent="updateExercise">
      <div>
        <label for="name" class="block text-xs font-semibold text-gray-900 uppercase">Name</label>
        <div class="mt-2">
          <input
            v-model="name"
            id="name"
            type="text"
            required
            class="block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6"
          />
        </div>
      </div>

      <div>
        <div>
          <label for="label" class="block text-xs font-semibold text-gray-900 uppercase">
            Label
          </label>
        </div>
        <div class="mt-2">
          <input
            v-model="label"
            id="label"
            type="text"
            placeholder="Optional"
            class="block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6"
          />
        </div>
      </div>

      <AppButton text="Create" type="submit" colour="primary" class="mt-6"
        >Update Exercise
      </AppButton>
    </form>
  </div>
</template>
