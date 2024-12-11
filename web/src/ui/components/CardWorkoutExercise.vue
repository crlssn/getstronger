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
    <RouterLink :to="`/exercises/${exerciseId}`" class="font-semibold text-base mr-1">
      {{ props.name }}
    </RouterLink>
    <span v-if="props.label" class="bg-indigo-600 text-white text-sm rounded py-0.5 px-1">
      {{ props.label }}
    </span>
  </p>
  <div class="mb-2">
    <table>
      <tbody>
        <tr v-for="(set, index) in props.sets" :key="index" class="text-gray-800 text-base">
          <td class="">Set {{ index + 1 }}:</td>
          <td class="font-medium text-right">{{ set.weight }} kg</td>
          <td class="font-medium">x</td>
          <td class="font-medium">
            {{ set.reps }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped></style>
