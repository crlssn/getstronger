<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useAlertStore } from '@/stores/alerts'
import { computed, nextTick, watch } from 'vue'

const route = useRoute()
const alertStore = useAlertStore()

const props = defineProps<{
  type: 'success' | 'error' | 'info'
  message: string
}>()

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

const alert = computed(() => alertStore.alert || { message: props.message, type: props.type })

const alertStyle = computed(() => {
  if (alert.value?.type === 'success') {
    return 'bg-green-200 border-green-300 text-green-700'
  }
  if (alert.value?.type === 'error') {
    return 'bg-red-200 border-red-300 text-red-700'
  }
  if (alert.value?.type === 'info') {
    return 'bg-gray-200 border-gray-300 text-gray-700'
  }
  return ''
})
</script>

<template>
  <div
    v-if="alertStore.alert"
    :class="alertStyle"
    class="border-b-2 border-t-2 py-4 px-5 font-medium"
  >
    {{ alertStore.alert.message }}
  </div>
  <div v-if="props.message" class="border-2 py-4 px-5 font-medium rounded-md mb-4" :class="alertStyle">
    {{ props.message }}
  </div>
</template>

<style scoped>
</style>
