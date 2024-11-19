<script setup lang="ts">
import { ChevronRightIcon } from '@heroicons/vue/20/solid'
import { onMounted, ref } from 'vue'
import { ListRoutinesRequest, Routine } from '@/pb/api/v1/routines_pb'
import { RoutineClient } from '@/clients/clients'
import Button from '@/components/Button.vue'

const pageToken = ref(new Uint8Array(0))
const routines = ref(Array<Routine>())

const fetchRoutines = async () => {
  const req = new ListRoutinesRequest({
    pageToken: pageToken.value,
    pageLimit: 100,
  })
  const res = await RoutineClient.list(req)
  routines.value = [...routines.value, ...res.routines]
  if (res.nextPageToken.length > 0) {
    pageToken.value = res.nextPageToken
    await fetchRoutines()
  }
}

onMounted(async () => {
  await fetchRoutines()
})
</script>

<template>
  <Button type="link" to="/routines/create" colour="primary">Create</Button>
  <ul
    role="list"
    class="divide-y divide-gray-100 overflow-hidden bg-white shadow-sm ring-1 ring-gray-900/5 rounded-md"
  >
    <li v-for="routine in routines" :key="routine.id">
      <RouterLink
        :to="`/routines/${routine.id}`"
        class="font-medium flex justify-between items-center gap-x-6 px-4 py-5 hover:bg-gray-50 sm:px-6m text-sm/6 text-gray-800"
      >
        {{ routine.name }}
        <ChevronRightIcon class="size-5 flex-none text-gray-400" aria-hidden="true" />
      </RouterLink>
    </li>
  </ul>
</template>
