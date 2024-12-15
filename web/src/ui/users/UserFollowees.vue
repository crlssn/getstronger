<script setup lang="ts">
import AppListItemLink from '@/ui/components/AppListItemLink.vue'
import AppList from '@/ui/components/AppList.vue'
import { listFollowees } from '@/http/requests.ts'
import { onMounted, ref } from 'vue'
import type { User } from '@/proto/api/v1/shared_pb.ts'
import { usePageTitleStore } from '@/stores/pageTitle.ts'
import AppAlert from '@/ui/components/AppAlert.vue'

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
  <AppList v-if="followees.length > 0">
    <AppListItemLink v-for="followee in followees" :key="followee.id" :to="`/users/${followee.id}`">
      {{ followee.firstName }} {{ followee.lastName }}
    </AppListItemLink>
  </AppList>
  <AppAlert v-if="followees.length === 0" type="info" message="Nothing here yet..." />
</template>

<style scoped></style>
