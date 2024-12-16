<script setup lang="ts">
import AppListItemLink from '@/ui/components/AppListItemLink.vue'
import AppList from '@/ui/components/AppList.vue'
import { listFollowees } from '@/http/requests.ts'
import { onMounted, ref } from 'vue'
import type { User } from '@/proto/api/v1/shared_pb.ts'
import { usePageTitleStore } from '@/stores/pageTitle.ts'
import AppListItem from '@/ui/components/AppListItem.vue'

const props = defineProps<{
  id: string
  pageTitle: string
}>()

const followees = ref([] as User[])
const pageTitleStore = usePageTitleStore()

onMounted(async () => {
  await fetchFollowees()
  pageTitleStore.setPageTitle(props.pageTitle)
})

const fetchFollowees = async () => {
  const res = await listFollowees(props.id)
  if (!res) return

  followees.value = res.followees
}
</script>

<template>
  <AppList>
    <AppListItemLink v-for="followee in followees" :key="followee.id" :to="`/users/${followee.id}`">
      {{ followee.firstName }} {{ followee.lastName }}
    </AppListItemLink>
    <AppListItem v-if="followees.length === 0"> Nothing here yet... </AppListItem>
  </AppList>
</template>

<style scoped></style>
