<script setup lang="ts">
import { watch } from 'vue'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/vue'
import { useI18n } from 'vue-i18n'

import { useConfirmationStore } from '@/stores/confirmation'
import blurActiveElement from '@/utils/blurActiveElement'

const { t } = useI18n()
const confirmationStore = useConfirmationStore()

watch(
  () => confirmationStore.confirmation,
  (confirmation) => {
    if (confirmation) blurActiveElement()
  },
)
</script>

<template>
  <!-- The dialog root renders through Headless UI's portal and never picks
       up this component's scope id, so its layout must be global utilities
       rather than a scoped class. -->
  <Dialog
    v-if="confirmationStore.confirmation"
    :open="true"
    class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
    @close="confirmationStore.dismiss"
  >
    <div class="dialog-backdrop" aria-hidden="true" />
    <DialogPanel class="dialog-panel">
      <span class="dialog-handle" aria-hidden="true"></span>
      <DialogTitle>{{ confirmationStore.confirmation.title }}</DialogTitle>
      <p v-if="confirmationStore.confirmation.body">{{ confirmationStore.confirmation.body }}</p>
      <div class="dialog-actions">
        <button type="button" class="dialog-cancel" @click="confirmationStore.dismiss">
          {{ confirmationStore.confirmation.cancelLabel ?? t('common.cancel') }}
        </button>
        <button
          type="button"
          class="dialog-confirm"
          :class="{ destructive: confirmationStore.confirmation.destructive }"
          @click="confirmationStore.accept"
        >
          {{ confirmationStore.confirmation.confirmLabel }}
        </button>
      </div>
    </DialogPanel>
  </Dialog>
</template>

<style scoped>
@reference '../../assets/base.css';

.dialog-backdrop {
  @apply fixed inset-0 bg-black/50;
}
.dialog-panel {
  @apply relative w-full rounded-t-sheet bg-white p-5 shadow-overlay sm:max-w-sm sm:rounded-sheet;
}
.dialog-handle {
  @apply mx-auto mb-4 block h-1 w-12 rounded-full bg-ink-tint sm:hidden;
}
.dialog-panel h2 {
  @apply text-title font-semibold text-text;
}
.dialog-panel p {
  @apply mt-2 text-sm text-text-muted;
}
.dialog-actions {
  @apply mt-5 grid gap-2;
}
.dialog-cancel,
.dialog-confirm {
  @apply flex min-h-(--size-control) w-full items-center justify-center gap-2 rounded-control text-sm font-semibold;
}
.dialog-cancel {
  @apply border border-border text-text-muted hover:bg-ink-surface;
}
.dialog-confirm {
  @apply bg-ink text-white hover:bg-ink-strong;
}
.dialog-confirm.destructive {
  @apply bg-danger hover:bg-danger-strong;
}
</style>
