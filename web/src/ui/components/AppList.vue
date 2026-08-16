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
@reference '../../assets/base.css';

ul {
  @apply card mb-4 divide-y divide-slate-100 overflow-hidden;

  li.fetching {
    @apply flex h-16 items-center justify-center text-slate-700;
  }
}
</style>
