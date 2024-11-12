<script setup lang="ts">
import {ListExercisesRequest} from "@/pb/api/v1/exercise_pb";
import {ExerciseClient} from "@/clients/clients";
import {onMounted, ref} from "vue";
import Button from "@/components/Button.vue";

const exercises = ref([]);
const name = ref(null);
const pageToken = ref(null);

onMounted(() => {
  fetchExercises()
})

const fetchExercises = async () => {
  console.log('fetching exercises')
  try {
    console.log('pageToken', pageToken.value)
    const request = new ListExercisesRequest({
      name: name.value,
      pageToken: pageToken.value,
    });

    const response = await ExerciseClient.list(request);
    exercises.value = [...exercises.value, ...response.exercises];

    pageToken.value = null;
    if (response.nextPageToken.length > 0) {
      pageToken.value = response.nextPageToken;
    }
  } catch (error) {
    console.error('fetch exercises failed:', error);
  }
}

function searchExercises() {
  exercises.value = [];
  pageToken.value = null;
  fetchExercises();
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds} sec`;
  }

  if (remainingSeconds === 0) {
    return `${minutes} min`;
  }

  return `${minutes} min ${remainingSeconds} sec`;
}
</script>

<template>
  <div class="px-4 sm:px-6 lg:px-8">
    <div class="sm:flex sm:items-center">
      <div class="sm:flex-auto">
        <h1 class="text-xl font-semibold text-gray-900">Exercises</h1>
      </div>
      <div class="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
        <RouterLink to="/exercises/create"
                    class="block rounded-md bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          Add
        </RouterLink>
      </div>
    </div>
    <input v-model="name" type="search" @keyup="searchExercises" placeholder="Search exercises"
           class="block mt-4 w-full rounded-md border-0 bg-white py-3.5 px-7 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6">
    <div class="mt-4 flow-root">
      <div class="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
        <div class="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
          <div class="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
            <table class="min-w-full divide-y divide-gray-300">
              <thead class="bg-gray-50">
              <tr>
                <th scope="col" class="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Name</th>
                <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Label</th>
                <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Rest</th>
                <th scope="col" class="relative py-3.5 pl-3 pr-4 sm:pr-6"></th>
              </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 bg-white">
              <tr v-if="exercises.length === 0">
                <td class="py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6 text-center" colspan="4">
                  No exercises found
                </td>
              </tr>
              <tr v-for="exercise in exercises" :key="exercise">
                <td class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                  {{ exercise.name }}
                </td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{{ exercise.label }}</td>
                <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                  <span v-if="exercise.restBetweenSets">{{ formatTime(exercise.restBetweenSets.seconds) }}</span>
                </td>
                <td class="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                  <RouterLink :to="`/exercises/${exercise.id}/edit`" class="text-indigo-600 hover:text-indigo-900">
                    Edit
                  </RouterLink>
                </td>
              </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    <div class="flex justify-center mt-4">
      <Button type="button" text="Load more" v-if="pageToken" @click="fetchExercises"/>
    </div>
  </div>
</template>

