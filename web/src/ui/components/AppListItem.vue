<script setup lang="ts">
const props = defineProps<{
  is?: 'danger' | 'header'
}>()
</script>

<template>
  <li :class="props.is">
    <slot />
  </li>
</template>

<style scoped>
li {
  @apply flex justify-between items-center gap-x-6 px-4 py-5 text-gray-900 font-medium;

  &.danger {
    @apply text-red-500;
  }
  &.header {
    @apply block text-sm font-semibold text-gray-600 uppercase ;
  }
}
</style>
