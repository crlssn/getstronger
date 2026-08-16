<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// Routed rather than local state, so each tab is its own addressable page and
// /routines is reachable from the UI instead of only by typing the URL.
const { t } = useI18n()
</script>

<template>
  <nav class="segmented" :aria-label="$t('training.heading')">
    <RouterLink to="/plans" active-class="is-selected">{{ t('common.plans') }}</RouterLink>
    <RouterLink to="/routines" active-class="is-selected">{{ t('common.routines') }}</RouterLink>
  </nav>
</template>
