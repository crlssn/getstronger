<script setup lang="ts">
import {ChevronDownIcon, ChevronUpIcon} from '@heroicons/vue/20/solid'
import {onMounted, ref} from "vue";
import {GetRoutineRequest, Routine} from "@/pb/api/v1/routines_pb";
import {RoutineClient} from "@/clients/clients";
import {useRoute} from "vue-router";

const routine = ref<Routine | undefined>(undefined);

const fetchRoutine = async (id: string) => {
  const req = new GetRoutineRequest({id})
  const res = await RoutineClient.get(req)
  routine.value = res.routine;
}
const route = useRoute()

onMounted(async () => {
  await fetchRoutine(route.params.id as string)
})

import Button from "@/components/Button.vue";
</script>

<template>
  <button type="button" class="uppercase mb-8 border-b-8 border-b-indigo-800 hover:border-b-indigo-700 w-full items-center rounded-md bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
    Start
  </button>
  <ul role="list" class="divide-y divide-gray-100 overflow-hidden bg-white shadow-sm ring-1 ring-gray-900/5 rounded-md mb-4">
    <li class="border-b border-gray-200 bg-white px-4 py-5">
      <div class="flex flex-wrap items-center justify-between">
        <h3 class="text-base font-medium text-gray-900">{{ routine?.name }}</h3>
      </div>
    </li>
    <li v-for="exercise in routine?.exercises" :key="exercise.id">
      <div class="flex justify-between items-center px-4 py-3 text-sm/6 text-gray-900">
        {{ exercise.name }}
        <div>
          <ChevronUpIcon class="size-5 flex-none text-gray-400 hover:text-gray-600 cursor-pointer" aria-hidden="true"/>
          <ChevronDownIcon class="size-5 flex-none text-gray-400  hover:text-gray-600  cursor-pointer" aria-hidden="true"/>
        </div>
      </div>
    </li>
  </ul>
  <Button type="button" colour="amber" class="mt-4">Edit</Button>
  <Button type="button" colour="red" class="mt-4">Delete</Button>
</template>
