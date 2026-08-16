<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useAlertStore } from '@/stores/alerts'
import { computed, nextTick, watch } from 'vue'
import { CheckCircleIcon, ExclamationTriangleIcon, XMarkIcon } from '@heroicons/vue/24/outline'

const route = useRoute()
const alertStore = useAlertStore()

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
</script>

<template>
  <div v-if="alertStore.alert" class="alert-region full-width">
    <div
      :class="alertStyle"
      :role="alertStore.alert.type === 'error' ? 'alert' : 'status'"
      class="alert-card"
      aria-live="polite"
    >
      <div class="alert-card-inner">
        <CheckCircleIcon v-if="alertStore.alert.type === 'success'" class="status-icon" />
        <ExclamationTriangleIcon v-else class="status-icon" />
        <p>{{ alertStore.alert.message }}</p>
        <button type="button" aria-label="Dismiss message" @click="alertStore.clear">
          <XMarkIcon />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.alert-region {
  @apply w-full;
}
.alert-card {
  @apply border-y text-sm font-semibold shadow-sm;
}
.alert-card-inner {
  @apply mx-auto flex min-h-14 w-full max-w-3xl items-center gap-3 px-3 py-3 sm:px-5 lg:px-8;
}
.status-icon {
  @apply size-5 shrink-0;
}
.alert-card-inner p {
  @apply min-w-0 flex-1;
}
.alert-card-inner button {
  @apply grid size-8 shrink-0 place-items-center rounded-lg transition hover:bg-black/5;
}
.alert-card button svg {
  @apply size-4;
}
</style>
