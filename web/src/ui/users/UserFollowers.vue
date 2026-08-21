<script setup lang="ts">
import AppList from '@/ui/components/AppList.vue'
import AppListItemLink from '@/ui/components/AppListItemLink.vue'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { type User } from '@/proto/api/v1/shared_pb.ts'
import { listFollowers } from '@/http/requests.ts'
import { handle } from '@/utils/names'
import { usePageTitleStore } from '@/stores/pageTitle.ts'
import AppListItem from '@/ui/components/AppListItem.vue'
import AppSkeleton from '@/ui/components/AppSkeleton.vue'

const { t } = useI18n()
const props = defineProps<{
  id: string
  pageTitle: string
}>()

const followers = ref([] as User[])
const isMounted = ref(false)
const pageTitleStore = usePageTitleStore()

onMounted(async () => {
  await fetchFollowers()
  pageTitleStore.setPageTitle(props.pageTitle)
  isMounted.value = true
})

const fetchFollowers = async () => {
  const res = await listFollowers(props.id)
  if (!res) return

  followers.value = res.followers
}
</script>

<template>
  <AppSkeleton v-if="!isMounted" />
  <AppList v-if="isMounted">
    <AppListItem v-if="followers.length === 0">{{ t('common.nothingHere') }}</AppListItem>
    <AppListItemLink v-for="follower in followers" :key="follower.id" :to="`/users/${follower.id}`">
      <span>
        <strong class="block font-medium">{{ handle(follower.username) }}</strong>
        <small class="mt-0.5 block text-sm font-normal text-text-subtle">{{ follower.name }}</small>
      </span>
    </AppListItemLink>
  </AppList>
</template>

<style scoped></style>
