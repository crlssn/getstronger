<script setup lang="ts">
import { vInfiniteScroll } from '@vueuse/components'

defineProps<{
  canFetch?: boolean
}>()

const emits = defineEmits(['fetch'])

const onFetch = async () => {
  emits('fetch')
}
</script>

<template>
  <ul role="list">
    <slot />
    <li v-if="canFetch" v-infinite-scroll="onFetch" />
  </ul>
</template>

<style scoped>
ul {
  @apply divide-y divide-gray-100 bg-white border-t border-b border-gray-200 mb-4;
}
</style>
