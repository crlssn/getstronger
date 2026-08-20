<script setup lang="ts">
import AppListItemLink from '@/ui/components/AppListItemLink.vue'
import AppList from '@/ui/components/AppList.vue'
import { listFollowees } from '@/http/requests.ts'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { User } from '@/proto/api/v1/shared_pb.ts'
import { usePageTitleStore } from '@/stores/pageTitle.ts'
import AppListItem from '@/ui/components/AppListItem.vue'
import AppSkeleton from '@/ui/components/AppSkeleton.vue'

const { t } = useI18n()
const props = defineProps<{
  id: string
  pageTitle: string
}>()

const followees = ref([] as User[])
const isMounted = ref(false)
const pageTitleStore = usePageTitleStore()

onMounted(async () => {
  await fetchFollowees()
  pageTitleStore.setPageTitle(props.pageTitle)
  isMounted.value = true
})

const fetchFollowees = async () => {
  const res = await listFollowees(props.id)
  if (!res) return

  followees.value = res.followees
}
</script>

<template>
  <AppSkeleton v-if="!isMounted" />
  <AppList v-if="isMounted">
    <AppListItem v-if="followees.length === 0">{{ t('common.nothingHere') }}</AppListItem>
    <AppListItemLink v-for="followee in followees" :key="followee.id" :to="`/users/${followee.id}`">
      {{ followee.firstName }} {{ followee.lastName }}
    </AppListItemLink>
  </AppList>
</template>

<style scoped></style>
