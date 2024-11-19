<script setup lang="ts">
import Button from "@/components/Button.vue";
import {onMounted, ref} from "vue";
import {GetRoutineRequest, Routine} from "@/pb/api/v1/routines_pb";
import {RoutineClient} from "@/clients/clients";
import {useRoute} from "vue-router";

const route = useRoute()
const routine = ref<Routine | undefined>(undefined)

const fetchRoutine = async (id: string) => {
  const req = new GetRoutineRequest({ id })
  const res = await RoutineClient.get(req)
  routine.value = res.routine
}

onMounted(async () => {
  await fetchRoutine(route.query.routine_id as string)
})
</script>

<template>
  <form>
    <div class="flex items-end">
      <div class="w-full">
        <label for="weight">Weight</label>
        <input id="weight" type="number">
      </div>
      <span>x</span>
      <div class="w-full">
        <label for="reps">Reps</label>
        <input id="reps" type="number">
      </div>
    </div>
    <Button type="submit" colour="primary" class="mt-6">Add Set</Button>
    <Button type="submit" colour="red" class="mt-6">Finish Workout</Button>
  </form>
</template>

<style scoped>
label {
  @apply block text-xs font-semibold text-gray-900 uppercase mb-2
}

input {
  @apply block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6;
}

span {
  @apply mx-4 font-medium mb-4 text-gray-900
}

</style>
