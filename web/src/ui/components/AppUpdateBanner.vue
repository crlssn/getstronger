<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { ArrowPathIcon, XMarkIcon } from '@heroicons/vue/24/outline'

import { useAppVersionStore } from '@/stores/appVersion'

// Prompts rather than reloading on its own: a reload mid-set would interrupt a
// workout the user is in the middle of logging.
const versionStore = useAppVersionStore()

onMounted(() => versionStore.start())
onUnmounted(() => versionStore.stop())
</script>

<template>
  <div v-if="versionStore.updateAvailable" class="update-banner" role="status">
    <ArrowPathIcon />
    <p>{{ $t('update.available') }}</p>
    <button type="button" class="refresh" @click="versionStore.refresh()">
      {{ $t('update.refresh') }}
    </button>
    <button
      type="button"
      class="dismiss"
      :aria-label="$t('common.close')"
      @click="versionStore.dismiss()"
    >
      <XMarkIcon />
    </button>
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

/* Sits above the bottom navigation and the workout dock. */
.update-banner {
  bottom: calc(5.75rem + env(safe-area-inset-bottom));
  @apply fixed inset-x-0 z-50 mx-auto flex max-w-lg items-center gap-3 rounded-card bg-surface-inverse px-4 py-3 text-white shadow-overlay;
  margin-inline: 0.75rem;
}
.update-banner > svg {
  @apply size-5 shrink-0;
}
.update-banner p {
  @apply min-w-0 flex-1 text-sm font-medium;
}
/* The banner floats over the workout dock, where a mis-tap costs a set. Both
   controls take the full floor; the negative margin keeps the bar its height. */
.refresh {
  @apply -my-1 min-h-(--size-control-sm) shrink-0 rounded-lg bg-white px-3 text-sm font-semibold text-ink transition hover:bg-ink-tint;
}
.dismiss {
  @apply -m-1 grid size-11 shrink-0 place-items-center rounded-lg text-ink-tint transition hover:bg-white/10 hover:text-white;
}
.dismiss svg {
  @apply size-5;
}
@media (min-width: 640px) {
  .update-banner {
    margin-inline: auto;
  }
}
</style>
