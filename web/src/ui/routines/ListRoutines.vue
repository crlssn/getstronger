<script setup lang="ts">
import {onMounted, ref} from 'vue'
import {create} from '@bufbuild/protobuf'
import {RoutineClient} from '@/http/clients'
import AppList from '@/ui/components/AppList.vue'
import AppButton from '@/ui/components/AppButton.vue'
import {ChevronRightIcon} from '@heroicons/vue/20/solid'
import AppListItemLink from '@/ui/components/AppListItemLink.vue'
import {ListRoutinesRequestSchema, type Routine} from '@/proto/api/v1/routines_pb'
import AppListItem from "@/ui/components/AppListItem.vue";

const pageToken = ref(new Uint8Array(0))
const routines = ref(Array<Routine>())

const fetchRoutines = async () => {
  const req = create(ListRoutinesRequestSchema, {
    pageLimit: 100,
    pageToken: pageToken.value,
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
  <AppButton
    type="link"
    to="/routines/create"
    colour="primary"
    container-class="p-4"
  >
    Create Routine
  </AppButton>
  <AppList>
<!--    <AppListItem is="header">Created</AppListItem>-->
    <AppListItemLink
      v-for="routine in routines"
      :key="routine.id"
      :to="`/routines/${routine.id}`"
    >
      <div>
        <p class="text-gray-900">{{ routine.name }}</p>
        <p class="text-sm text-gray-500 font-medium">2 days ago</p>
      </div>
      <ChevronRightIcon class="size-8 text-gray-500"/>
    </AppListItemLink>
  </AppList>
</template>
