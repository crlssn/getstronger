<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { listFeedItems } from '@/http/requests.ts'
import CardWorkout from '@/ui/components/CardWorkout.vue'
import { type FeedItem } from '@/proto/api/v1/feed_service_pb'
import usePagination from '@/utils/usePagination'
import { vInfiniteScroll } from '@vueuse/components'

const { hasMorePages, pageToken, resolvePageToken } = usePagination()

const feedItems = ref([] as FeedItem[])

onMounted(async () => {
  await fetchFeedItems()
})

const fetchFeedItems = async () => {
  const res = await listFeedItems(pageToken.value)
  if (!res) return

  feedItems.value = [...feedItems.value, ...res.items]
  pageToken.value = resolvePageToken(res.pagination)
}
</script>

<template>
  <div class="bg-white rounded-md border border-gray-200">
    <template v-for="item in feedItems" :key="item.type.value?.id">
      <CardWorkout v-if="item.type.case === 'workout'" compact :workout="item.type.value" />
    </template>
    <div v-if="hasMorePages" v-infinite-scroll="fetchFeedItems"></div>
  </div>
</template>
