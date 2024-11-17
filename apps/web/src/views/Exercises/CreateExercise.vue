<script setup lang="ts">
import {CreateExerciseRequest, RestBetweenSets} from "@/pb/api/v1/exercise_pb";
import Button from "@/components/Button.vue";
import {ref} from "vue";
import {ExerciseClient} from "@/clients/clients";
import {ConnectError} from "@connectrpc/connect";

const name = ref('')
const label = ref('')
const resError = ref('');
const resOK = ref(false);
const rest = ref(0);

const restOptions = [
  {value: 30, label: '30 seconds'},
  {value: 60, label: '1 minute'},
  {value: 90, label: '1 minute 30 seconds'},
  {value: 120, label: '2 minutes'},
  {value: 150, label: '2 minutes 30 seconds'},
  {value: 180, label: '3 minutes'},
  {value: 210, label: '3 minutes 30 seconds'},
  {value: 240, label: '4 minutes'},
  {value: 270, label: '4 minutes 30 seconds'},
  {value: 300, label: '5 minutes'},
]

async function createExercise() {
  let restBetweenSets;
  if (rest.value > 0) {
    restBetweenSets = new RestBetweenSets({seconds: rest.value});
  }

  const request = new CreateExerciseRequest({
    name: name.value,
    label: label.value,
    restBetweenSets: restBetweenSets,
  });
  try {
    await ExerciseClient.create(request);
    resOK.value = true;
    resError.value = '';
    name.value = '';
    label.value = '';
    rest.value = 0;
  } catch (error) {
    resOK.value = false;
    if (error instanceof ConnectError) {
      resError.value = error.message;
      return
    }
    console.error('create exercise failed:', error);
  }
}

</script>

<template>
  <div class="">
    <div v-if="resOK" class="border-2 border-green-400 bg-green-300 rounded-md py-3 px-5 mb-4 text-sm text-green-800 font-medium" role="alert">
      Your new exercise has been created successfully.
    </div>
    <div v-if="resError" class="border-2 border-red-400 bg-red-300 mb-4 rounded-md py-3 px-5 mb-2 text-sm text-red-800" role="alert">
      {{ resError }}
    </div>
    <form class="space-y-6" @submit.prevent="createExercise">
      <div>
        <label for="name" class="block text-xs font-semibold text-gray-900 uppercase">Name</label>
        <div class="mt-2">
          <input v-model="name" id="name" type="text" required class="block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6">
        </div>
      </div>

      <div>
        <div>
          <label for="label" class="block text-xs font-semibold text-gray-900 uppercase">Label</label>
        </div>
        <div class="mt-2">
          <input v-model="label" id="label" type="text" class="block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6">
        </div>
      </div>

      <div>
        <div>
          <label for="rest" class="block text-xs font-semibold text-gray-900 uppercase">Rest between sets</label>
        </div>
        <div class="mt-2">
          <select v-model="rest" id="rest" class="block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6">
            <option :value="0" selected>Unspecified</option>
            <option v-for="rest in restOptions" :key="rest.value" :value="rest.value">{{ rest.label }}</option>
          </select>
        </div>
      </div>
      <Button text="Create" type="submit" colour="primary" class="mt-6">Save</Button>
    </form>
  </div>
</template>
