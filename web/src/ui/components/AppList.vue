<script setup lang="ts">
import { vInfiniteScroll } from '@vueuse/components'

const props = defineProps<{
  load?: {
    hasMorePages: boolean
    fetchPage: () => Promise<void>
  }
}>()
</script>

<template>
  <ul role="list">
    <slot />
    <li v-if="props.load?.hasMorePages" v-infinite-scroll="props.load?.fetchPage" />
  </ul>
</template>

<style scoped>
ul {
  @apply divide-y divide-gray-100 bg-white border-t border-b border-gray-200 mb-4;
}
</style>
