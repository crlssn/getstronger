<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useAlertStore } from '@/stores/alerts'
import { computed, nextTick, watch } from 'vue'

const route = useRoute()
const alertStore = useAlertStore()

const props = defineProps<{
  fixed?: boolean
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

const alertStyle = computed(() => {
  let style = ''
  if (props.fixed) {
    style = 'fixed top-16 left-0 right-0'
  }

  if (alertStore.alert?.type === 'success') {
    return `${style} bg-green-200 border-green-300 text-green-700`
  }

  if (alertStore.alert?.type === 'error') {
    return `${style} bg-red-200 border-red-300 text-red-700`
  }

  return ''
})
</script>

<template>
  <div v-if="alertStore.alert" :class="alertStyle" class="border-b-2 border-t-2 font-medium">
    <div class="max-w-4xl mx-auto py-4 px-5">
      {{ alertStore.alert.message }}
    </div>
  </div>
</template>

<style scoped></style>
