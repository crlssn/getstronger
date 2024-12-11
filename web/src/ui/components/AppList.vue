<script setup lang="ts">
import { defineProps } from 'vue'
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
  </ul>
  <template v-if="props.load">
    <div v-if="props.load.hasMorePages" v-infinite-scroll="props.load.fetchPage" />
  </template>
</template>

<style scoped>
ul {
  @apply divide-y divide-gray-100 bg-white border-t border-b border-gray-200 mb-4;
}
</style>
