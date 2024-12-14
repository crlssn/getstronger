<script setup lang="ts">
import { vInfiniteScroll } from '@vueuse/components'
import { ArrowPathIcon } from '@heroicons/vue/24/outline'

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
    <li v-if="canFetch" v-infinite-scroll="onFetch" class="fetching">
      <ArrowPathIcon class="size-7 animate-spin" />
    </li>
  </ul>
</template>

<style scoped>
ul {
  @apply divide-y divide-gray-100 bg-white border border-gray-200 mb-4 rounded-md;

  li.fetching {
    @apply h-16 flex justify-center items-center text-gray-800;
  }
}
</style>
