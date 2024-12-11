<script setup lang="ts">
import {onMounted, ref} from 'vue'
import AppList from '@/ui/components/AppList.vue'
import AppButton from '@/ui/components/AppButton.vue'
import {ChevronRightIcon} from '@heroicons/vue/20/solid'
import AppListItemLink from '@/ui/components/AppListItemLink.vue'
import {type Routine} from '@/proto/api/v1/routine_service_pb.ts'
import {listRoutines} from "@/http/requests.ts";

const pageToken = ref(new Uint8Array(0))
const routines = ref(Array<Routine>())

const fetchRoutines = async () => {
  const res = await listRoutines(pageToken.value)
  if (!res) return

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
  <AppButton
    type="link"
    to="/routines/create"
    colour="primary"
    container-class="px-4 pb-4"
  >
    Create Routine
  </AppButton>
  <AppList>
    <AppListItemLink
      v-for="routine in routines"
      :key="routine.id"
      :to="`/routines/${routine.id}`"
    >
      {{ routine.name }}
      <ChevronRightIcon class="size-8 text-gray-500" />
    </AppListItemLink>
  </AppList>
</template>
