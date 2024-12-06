<script setup lang="ts">
import { useAlertStore } from '@/stores/alerts';

const alertStore = useAlertStore()
</script>

<template>
  <div
    v-if="alertStore.alert"
    class="bg-green-200 border-b-2 border-t-2 border-green-300 rounded-md py-4 px-9 text-sm text-green-700 font-medium"
    role="alert"
  >
    {{ alertStore.alert }}
  </div>
</template>

<style scoped>

</style>
