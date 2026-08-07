<script setup lang="ts">
withDefaults(
  defineProps<{
    compact?: boolean
    tags?: string[]
  }>(),
  {
    compact: false,
    tags: () => [],
  },
)
</script>

<template>
  <span v-if="tags.length" class="exercise-tags" :class="{ compact }">
    <span v-for="tag in tags" :key="tag">{{ tag }}</span>
  </span>
</template>

<style scoped>
.exercise-tags {
  @apply inline-flex min-w-0 flex-wrap items-center gap-1.5;
}
.exercise-tags > span {
  @apply max-w-40 truncate rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700;
}
.exercise-tags.compact {
  @apply gap-1;
}
.exercise-tags.compact > span {
  @apply max-w-28 px-2 py-0.5 text-[0.6875rem];
}
</style>
