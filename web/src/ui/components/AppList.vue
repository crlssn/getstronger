<script setup lang="ts">
import { vInfiniteScroll } from '@vueuse/components'
import { ArrowPathIcon } from '@heroicons/vue/24/outline'
import AppCard from '@/ui/components/AppCard.vue'

defineProps<{
  canFetch?: boolean
}>()

const emits = defineEmits(['fetch'])

const onFetch = async () => {
  emits('fetch')
}
</script>

<template>
  <AppCard>
    <ul role="list">
      <slot />
      <li v-if="canFetch" v-infinite-scroll="onFetch" class="fetching">
        <ArrowPathIcon class="size-7 animate-spin" />
      </li>
    </ul>
  </AppCard>
</template>

<style scoped>
ul {
  @apply divide-y divide-gray-100;

  li.fetching {
    @apply h-16 flex justify-center items-center text-gray-800;
  }
}
</style>
