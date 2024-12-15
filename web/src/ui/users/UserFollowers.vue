<script setup lang="ts">
import AppList from '@/ui/components/AppList.vue'
import AppListItemLink from '@/ui/components/AppListItemLink.vue'
import { onMounted, ref } from 'vue'
import { type User } from '@/proto/api/v1/shared_pb.ts'
import { listFollowers } from '@/http/requests.ts'
import { usePageTitleStore } from '@/stores/pageTitle.ts'
import AppAlert from '@/ui/components/AppAlert.vue'

const props = defineProps<{
  id: string
  pageTitle: string
}>()

const followers = ref([] as User[])
const pageTitleStore = usePageTitleStore()

onMounted(async () => {
  await fetchFollowers()
  pageTitleStore.setPageTitle(props.pageTitle)
})

const fetchFollowers = async () => {
  const res = await listFollowers(props.id)
  if (!res) return

  followers.value = res.followers
}
</script>

<template>
  <AppList v-if="followers.length > 0">
    <AppListItemLink v-for="follower in followers" :key="follower.id" :to="`/users/${follower.id}`">
      {{ follower.firstName }} {{ follower.lastName }}
    </AppListItemLink>
  </AppList>
  <AppAlert v-if="followers.length === 0" type="info" message="Nothing here yet..."/>
</template>

<style scoped></style>
