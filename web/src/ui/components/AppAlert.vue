<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useAlertStore } from '@/stores/alerts'
import { computed, nextTick, onUnmounted, watch } from 'vue'
import { CheckCircleIcon, ExclamationTriangleIcon, XMarkIcon } from '@heroicons/vue/24/outline'

const route = useRoute()
const alertStore = useAlertStore()

const props = defineProps<{
  fixed?: boolean
}>()

let dismissTimer: ReturnType<typeof setTimeout> | undefined

watch(
  () => alertStore.alert,
  (alert) => {
    if (dismissTimer) clearTimeout(dismissTimer)
    if (alert) dismissTimer = setTimeout(alertStore.clear, 6000)
  },
  { immediate: true },
)

onUnmounted(() => {
  if (dismissTimer) clearTimeout(dismissTimer)
})

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
    return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  }

  if (alertStore.alert?.type === 'error') {
    return 'border-red-200 bg-red-50 text-red-800'
  }

  return ''
})

const containerStyle = computed(() => (props.fixed ? 'fixed inset-x-0 top-16 z-50' : ''))
</script>

<template>
  <div v-if="alertStore.alert" :class="containerStyle" class="alert-region">
    <div
      :class="alertStyle"
      :role="alertStore.alert.type === 'error' ? 'alert' : 'status'"
      class="alert-card"
      aria-live="polite"
    >
      <CheckCircleIcon v-if="alertStore.alert.type === 'success'" class="status-icon" />
      <ExclamationTriangleIcon v-else class="status-icon" />
      <p>{{ alertStore.alert.message }}</p>
      <button type="button" aria-label="Dismiss message" @click="alertStore.clear">
        <XMarkIcon />
      </button>
    </div>
  </div>
</template>

<style scoped>
.alert-region { @apply mx-auto w-full max-w-6xl px-3 pt-3 sm:px-5 lg:px-8; }
.alert-card { @apply flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm; }
.status-icon { @apply size-5 shrink-0; }
.alert-card p { @apply min-w-0 flex-1; }
.alert-card button { @apply grid size-8 shrink-0 place-items-center rounded-lg transition hover:bg-black/5; }
.alert-card button svg { @apply size-4; }
</style>
