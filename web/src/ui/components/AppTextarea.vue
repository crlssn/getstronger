<script setup lang="ts">
const props = defineProps<{
  placeholder: string
  rows: number
}>()
</script>

<template>
  <textarea
    class="w-full border border-ink-border rounded-control shadow-card focus:ring-ink-muted focus:border-ink-muted sm:text-sm mb-1"
    :placeholder="props.placeholder"
    :rows="props.rows"
  />
</template>

<style scoped></style>
