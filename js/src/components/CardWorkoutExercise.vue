<script setup lang="ts">
const props = defineProps<{
  name: string,
  label?: string,
  sets: Array<{
    reps: number,
    weight: number,
  }>
}>()
</script>

<template>
  <p>
    <span class="font-semibold mr-1">{{ props.name }}</span>
    <span class="bg-indigo-600 text-white text-xs rounded py-0.5 px-1" v-if="props.label">{{ props.label }}</span>
  </p>
  <p class="mb-2">
    <span class="mr-2" v-for="(set, index) in props.sets" :key="index">{{ set.weight }} kg x {{ set.reps }}</span>
  </p>
</template>

<style scoped>

</style>
