<script setup lang="ts">
const props = defineProps<{
  is?: 'danger'
}>()
</script>

<template>
  <li :class="props.is">
    <slot />
  </li>
</template>

<style scoped>
li {
  @apply flex justify-between items-center gap-x-6 px-4 py-5 text-gray-900;

  &.danger {
    @apply text-red-500;
  }
}
</style>
