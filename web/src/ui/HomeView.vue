<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { listFeedItems } from '@/http/requests.ts'
import CardWorkout from '@/ui/components/CardWorkout.vue'
import { type FeedItem } from '@/proto/api/v1/feed_service_pb'
import usePagination from '@/utils/usePagination'
import { vInfiniteScroll } from '@vueuse/components'
import { useNavTabs } from '@/stores/navTabs.ts'
import { useRoute } from 'vue-router'
import AppAlert from '@/ui/components/AppAlert.vue'

const route = useRoute()
const navTabs = useNavTabs()
const { hasMorePages, pageToken, resolvePageToken } = usePagination()

const feedItems = ref([] as FeedItem[])

onMounted(async () => {
  await fetchFeedItems()
  navTabs.set([
    { name: 'Following', href: '/home' },
    { name: 'Explore', href: '/home?explore' },
  ])
})

watch(
  () => route.query.explore,
  () => {
    feedItems.value = []
    fetchFeedItems()
  },
)

const fetchFeedItems = async () => {
  const followedOnly = route.query.explore !== null
  const res = await listFeedItems(pageToken.value, followedOnly)
  if (!res) return

  feedItems.value = [...feedItems.value, ...res.items]
  pageToken.value = resolvePageToken(res.pagination)
}
</script>

<template>
  <template v-for="item in feedItems" :key="item.type.value?.id">
    <CardWorkout v-if="item.type.case === 'workout'" compact :workout="item.type.value" />
  </template>
  <AppAlert v-if="feedItems.length === 0" type="info" message="Nothing here yet..."/>
  <div v-if="hasMorePages" v-infinite-scroll="fetchFeedItems"></div>
</template>
