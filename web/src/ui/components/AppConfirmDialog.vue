<script setup lang="ts">
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useConfirmationStore } from '@/stores/confirmation'
import AppSheet from '@/ui/components/AppSheet.vue'
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
  <AppSheet
    v-if="confirmationStore.confirmation"
    :title="confirmationStore.confirmation.title"
    :body="confirmationStore.confirmation.body"
    @close="confirmationStore.dismiss"
  >
    <template #actions>
      <button
        type="button"
        class="dialog-confirm"
        :class="confirmationStore.confirmation.destructive ? 'danger destructive' : 'primary'"
        @click="confirmationStore.accept"
      >
        {{ confirmationStore.confirmation.confirmLabel }}
      </button>
      <button type="button" class="dialog-cancel tertiary" @click="confirmationStore.dismiss">
        {{ confirmationStore.confirmation.cancelLabel ?? t('common.cancel') }}
      </button>
    </template>
  </AppSheet>
</template>
