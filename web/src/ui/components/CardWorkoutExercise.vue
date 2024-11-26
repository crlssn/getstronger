<script setup lang="ts">
const props = defineProps<{
  label?: string
  name?: string
  sets: Array<{
    reps: number
    weight: number
  }>
}>()
</script>

<template>
  <p>
    <span class="font-semibold mr-1">{{ props.name }}</span>
    <span
      v-if="props.label"
      class="bg-indigo-600 text-white text-xs rounded py-0.5 px-1"
    >
      {{ props.label }}
    </span>
  </p>
  <div class="mb-2">
    <p
      v-for="(set, index) in props.sets"
      :key="index"
    >
      {{ set.weight }} kg x {{ set.reps }}
    </p>
  </div>
</template>

<style scoped></style>
