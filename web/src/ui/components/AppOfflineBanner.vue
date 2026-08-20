<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { SignalSlashIcon } from '@heroicons/vue/24/outline'

import { useConnectionStore } from '@/stores/connection'
import { useMutationQueueStore } from '@/stores/mutationQueue'

// Owns the app's offline lifecycle: watches connectivity, tells the user when
// the app is showing saved data, and flushes changes queued while offline.
const connectionStore = useConnectionStore()
const mutationQueueStore = useMutationQueueStore()

onMounted(() => {
  connectionStore.start()
  // Changes queued in a previous session sync as soon as the app starts.
  void mutationQueueStore.flush()
})
onUnmounted(() => connectionStore.stop())
</script>

<template>
  <div v-if="!connectionStore.online" class="offline-banner" role="status">
    <SignalSlashIcon />
    <p>
      {{ $t('offline.banner') }}
      <span v-if="mutationQueueStore.pending.length">
        {{ $t('offline.queued', mutationQueueStore.pending.length) }}
      </span>
    </p>
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

/* Floats above the bottom navigation, mirroring the update banner, where it
   covers no header actions. */
.offline-banner {
  bottom: calc(5.75rem + env(safe-area-inset-bottom));
  @apply fixed inset-x-0 z-40 mx-auto flex w-max max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-pill bg-surface-inverse px-4 py-2 text-white shadow-overlay;
}
.offline-banner > svg {
  @apply size-4 shrink-0;
}
.offline-banner p {
  @apply min-w-0 text-xs font-semibold;
}
.offline-banner span {
  @apply font-normal text-ink-tint;
}
</style>
