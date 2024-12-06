<script setup lang="ts">
import type { LocationQueryValue } from 'vue-router';

const props = defineProps<{
  text?: LocationQueryValue | LocationQueryValue[]
}>();
</script>

<template>
  <div
    v-if="props.text"
    class="bg-green-200 border-b-2 border-t-2 border-green-300 rounded-md py-4 px-9 text-sm text-green-700 font-medium"
    role="alert"
  >
    {{ props.text }}
  </div>
</template>

<style scoped>

</style>
