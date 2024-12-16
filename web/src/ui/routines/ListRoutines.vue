<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { listRoutines } from '@/http/requests.ts'
import AppList from '@/ui/components/AppList.vue'
import AppButton from '@/ui/components/AppButton.vue'
import { ChevronRightIcon } from '@heroicons/vue/20/solid'
import AppListItemLink from '@/ui/components/AppListItemLink.vue'
import { type Routine } from '@/proto/api/v1/routine_service_pb.ts'
import usePagination from '@/utils/usePagination.ts'
import AppListItem from '@/ui/components/AppListItem.vue'

const routines = ref([] as Routine[])
const isMounted = ref(false)
const { hasMorePages, pageToken, resolvePageToken } = usePagination()

onMounted(async () => {
  await fetchRoutines()
  isMounted.value = true
})

const fetchRoutines = async () => {
  const res = await listRoutines(pageToken.value)
  if (!res) return

  routines.value = [...routines.value, ...res.routines]
  pageToken.value = resolvePageToken(res.pagination)
}
</script>

<template>
  <AppButton type="link" to="/routines/create" colour="primary" class="mb-4">
    Create Routine
  </AppButton>
  <AppList :can-fetch="hasMorePages" @fetch="fetchRoutines" v-if="isMounted">
    <AppListItemLink v-for="routine in routines" :key="routine.id" :to="`/routines/${routine.id}`">
      {{ routine.name }}
      <ChevronRightIcon class="size-8 text-gray-500" />
    </AppListItemLink>
    <AppListItem v-if="routines.length === 0"> Your routines will appear here </AppListItem>
  </AppList>
</template>
