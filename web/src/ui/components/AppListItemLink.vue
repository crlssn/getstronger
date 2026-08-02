<script setup lang="ts">
defineProps<{
  to: string
}>()
</script>

<template>
  <li>
    <RouterLink :to="to">
      <slot />
    </RouterLink>
  </li>
</template>

<style scoped>
a {
  @apply flex items-center justify-between gap-x-6 px-4 py-5 font-medium text-slate-900 transition hover:bg-slate-50 hover:text-indigo-700;
}

a > :deep(svg) {
  @apply size-5 shrink-0;
}
</style>
