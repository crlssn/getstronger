<script setup lang="ts">
import {Exercise, GetExerciseRequest, RestBetweenSets, UpdateExerciseRequest} from "@/pb/api/v1/exercise_pb";
import Button from "@/components/Button.vue";
import {onMounted, ref} from "vue";
import {ExerciseClient} from "@/clients/clients";
import {ConnectError} from "@connectrpc/connect";
import {useRoute} from "vue-router";
import {FieldMask} from "@bufbuild/protobuf";
import router from "@/router/router";

const name = ref('')
const label = ref('')
const resError = ref('');
const resOK = ref(false);
const rest = ref(0);

const route = useRoute()

console.log(route.params.id)
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

async function loadExercise() {
  const request = new GetExerciseRequest({
    id: route.params.id as string,
  })
  try {
    const response = await ExerciseClient.get(request);
    if (typeof response.exercise === 'undefined') {
      return
    }
    name.value = response.exercise.name;
    label.value = response.exercise.label;
    if (response.exercise.restBetweenSets) {
      rest.value = response.exercise.restBetweenSets.seconds;
    }
  } catch (error) {
    resOK.value = false;
    if (error instanceof ConnectError) {
      resError.value = error.message;
      return
    }
    console.error('create exercise failed:', error);
  }
}

onMounted(() => {
  loadExercise()
})

async function updateExercise() {
  let restBetweenSets;
  if (rest.value > 0) {
    restBetweenSets = new RestBetweenSets({seconds: rest.value});
  }

  const request = new UpdateExerciseRequest({
    exercise: new Exercise({
      id: route.params.id[0],
      name: name.value,
      label: label.value,
      restBetweenSets: restBetweenSets,
    }),
    updateMask: new FieldMask({paths: ['name', 'label', 'rest_between_sets']}),
  });
  try {
    await ExerciseClient.update(request);
    resOK.value = true;
    resError.value = '';
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
  <form class="space-y-6" method="POST" @submit.prevent="updateExercise">
    <div class="divide-y divide-gray-200 overflow-hidden rounded-lg bg-white shadow mb-4">
      <div class="px-4 py-4 sm:px-6">
        <span class="font-semibold">Update Exercise</span>
      </div>
      <div class="px-4 py-4 sm:px-6">
        <div v-if="resOK" class="bg-green-200 rounded-md py-3 px-5 mb-2 text-sm/6 text-green-800" role="alert">
          Exercise updated
        </div>
        <div v-if="resError" class="bg-red-200 rounded-md py-3 px-5 mb-2 text-sm/6 text-red-800" role="alert">
          {{ resError }}
        </div>
        <div>
          <label for="name" class="block text-sm/6 font-medium text-gray-900">Name</label>
          <div class="mt-2">
            <input v-model="name" id="name" type="text" required
                   class="block w-full rounded-md border-0 bg-white/5 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6">
          </div>
        </div>

        <div>
          <div>
            <label for="label" class="block text-sm/6 font-medium text-gray-900">Label</label>
          </div>
          <div class="mt-2">
            <input v-model="label" id="label" type="text"
                   class="block w-full rounded-md border-0 bg-white/5 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6">
          </div>
        </div>

        <div>
          <div>
            <label for="rest" class="block text-sm/6 font-medium text-gray-900">Rest between sets</label>
          </div>
          <div class="mt-2">
            <select v-model="rest" id="rest"
                    class="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6">
              <option :value="0" selected>Unspecified</option>
              <option v-for="rest in restOptions" :key="rest.value" :value="rest.value">{{ rest.label }}</option>
            </select>
          </div>
        </div>
      </div>
      <div class="px-4 py-4 sm:px-6">
        <Button text="Update" type="submit"/>
      </div>
    </div>
  </form>
</template>
