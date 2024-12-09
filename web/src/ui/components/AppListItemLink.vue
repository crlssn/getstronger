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
  @apply flex justify-between items-center gap-x-6 px-4 py-5 text-sm text-gray-900;
}
</style>
