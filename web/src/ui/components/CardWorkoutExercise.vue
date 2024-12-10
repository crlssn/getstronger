<script setup lang="ts">
const props = defineProps<{
  exerciseId?: string
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
    <RouterLink
      :to="`/exercises/${exerciseId}`"
      class="font-semibold mr-1"
    >
      {{ props.name }}
    </RouterLink>
    <span
      v-if="props.label"
      class="bg-indigo-600 text-white text-xs rounded py-0.5 px-1"
    >
      {{ props.label }}
    </span>
  </p>
  <div class="mb-2">
    <table>
      <tbody>
      <tr>
    <tr
      class="text-gray-800"
      v-for="(set, index) in props.sets"
      :key="index"
    >
      Set {{ index+1 }}: <span class="font-medium">{{ set.weight }} kg x {{ set.reps }}</span>
    </tr>
      </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped></style>
