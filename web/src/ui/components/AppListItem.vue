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
  @apply flex items-center justify-between gap-x-6 px-4 py-5 font-medium text-slate-900;

  &.danger {
    @apply text-red-600;
  }
  &.header {
    @apply block text-sm font-semibold text-slate-600;
  }
}

li > :deep(svg) {
  @apply size-5 shrink-0;
}
</style>
