<script setup lang="ts">
import { ref } from 'vue'
import { create } from '@bufbuild/protobuf'
import { ExerciseClient } from '@/http/clients'
import { ConnectError } from '@connectrpc/connect'
import AppButton from '@/ui/components/AppButton.vue'
import { CreateExerciseRequestSchema } from '@/proto/api/v1/exercise_pb'

const name = ref('')
const label = ref('')
const resError = ref('')
const resOK = ref(false)
const rest = ref(0)

async function createExercise() {
  const request = create(CreateExerciseRequestSchema, {
    label: label.value,
    name: name.value,
  })
  try {
    await ExerciseClient.create(request)
    resOK.value = true
    resError.value = ''
    name.value = ''
    label.value = ''
    rest.value = 0
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
      Your new exercise has been created successfully.
    </div>
    <div
      v-if="resError"
      class="border-2 border-red-400 bg-red-300 mb-4 rounded-md py-3 px-5 mb-2 text-sm text-red-800"
      role="alert"
    >
      {{ resError }}
    </div>
    <form
      class="space-y-6"
      @submit.prevent="createExercise"
    >
      <div>
        <label
          for="name"
          class="block text-xs font-semibold text-gray-900 uppercase"
        >Name</label>
        <div class="mt-2">
          <input
            id="name"
            v-model="name"
            type="text"
            required
            class="block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm"
          >
        </div>
      </div>

      <div>
        <div>
          <label
            for="label"
            class="block text-xs font-semibold text-gray-900 uppercase"
          >
            Label
          </label>
        </div>
        <div class="mt-2">
          <input
            id="label"
            v-model="label"
            type="text"
            placeholder="Optional"
            class="block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm"
          >
        </div>
      </div>

      <AppButton
        text="Create"
        type="submit"
        colour="primary"
        class="mt-6"
      >
        Save Exercise
      </AppButton>
    </form>
  </div>
</template>
