<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {listFeedItems} from "@/http/requests.ts";
import CardWorkout from '@/ui/components/CardWorkout.vue'
import { type FeedItem } from '@/proto/api/v1/feed_service_pb'

const pageToken = ref(new Uint8Array(0))
const feedItems = ref([] as FeedItem[])

const fetchFeed = async () => {
  const res = await listFeedItems(pageToken.value)
  if (!res) return

  feedItems.value = [...feedItems.value, ...res.items]
  pageToken.value = res.pagination?.nextPageToken || new Uint8Array(0)
  if (pageToken.value.length > 0) {
    // TODO: Implement pagination.
    await fetchFeed()
  }
}

onMounted(async () => {
  await fetchFeed()
})
</script>

<template>
  <div
    v-for="item in feedItems"
    :key="item.type.value?.id"
  >
    <CardWorkout
      v-if="item.type.case === 'workout'"
      compact
      :workout="item.type.value"
    />
  </div>
</template>
