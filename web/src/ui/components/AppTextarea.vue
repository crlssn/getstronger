<script setup lang="ts">
const props = defineProps<{
  placeholder: string
  rows: number
}>()
</script>

<template>
  <textarea
    class="w-full border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm mb-1"
    :placeholder="props.placeholder"
    :rows="props.rows"
  />
</template>

<style scoped></style>
