<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useAlertStore } from '@/stores/alerts'
import { computed, nextTick, watch } from 'vue'

const route = useRoute()
const alertStore = useAlertStore()

// DEBT: Doesn't properly work when there is no route change.
watch(
  () => route.path,
  () => {
    nextTick(() => {
      if (!alertStore.alert) {
        return
      }

      if (!alertStore.alert.seen) {
        alertStore.markSeen()
        return
      }

      alertStore.clear()
    })
  },
)

const alertStyle = computed(() => {
  if (alertStore.alert?.type === 'success') {
    return 'bg-green-200 border-green-300 text-green-700'
  }
  if (alertStore.alert?.type === 'error') {
    return 'bg-red-200 border-red-300 text-red-700'
  }
  return ''
})
</script>

<template>
  <div
    v-if="alertStore.alert"
    :class="alertStyle"
    class="border-b-2 border-t-2 py-4 px-5 font-medium"
    role="alert"
  >
    {{ alertStore.alert.message }}
  </div>
</template>

<style scoped></style>
