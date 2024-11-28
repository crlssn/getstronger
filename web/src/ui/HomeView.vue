<script setup lang="ts">

import { onMounted, ref } from 'vue'
import { create } from '@bufbuild/protobuf'
import { FeedClient } from '@/clients/clients.ts'
import CardWorkout from '@/ui/components/CardWorkout.vue'
import { type FeedItem, ListItemsRequestSchema } from '@/proto/api/v1/feed_pb.ts'

const pageToken = ref(new Uint8Array(0))
const feedItems = ref([] as FeedItem[])

const fetchFeed = async () => {
  const req = create(ListItemsRequestSchema, {
    pagination: {
      pageLimit: 100,
      pageToken: pageToken.value,
    },
  })
  const res = await FeedClient.listItems(req)
  console.log(res)
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
      :workout="item.type.value"
    />
  </div>
</template>
