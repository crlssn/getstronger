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
@reference '../../assets/base.css';

li {
  @apply flex items-center justify-between gap-x-6 px-4 py-5 font-medium text-text;

  &.danger {
    @apply text-danger;
  }
  &.header {
    @apply block text-sm font-semibold text-text-muted;
  }
}

li > :deep(svg) {
  @apply size-5 shrink-0;
}
</style>
