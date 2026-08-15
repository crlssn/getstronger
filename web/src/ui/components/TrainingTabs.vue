<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// Routed rather than local state, so each tab is its own addressable page and
// /routines is reachable from the UI instead of only by typing the URL.
const { t } = useI18n()
</script>

<template>
  <nav class="tabs" :aria-label="$t('training.heading')">
    <RouterLink to="/plans" active-class="active">{{ t('common.plans') }}</RouterLink>
    <RouterLink to="/routines" active-class="active">{{ t('common.routines') }}</RouterLink>
  </nav>
</template>

<style scoped>
@reference '../../assets/base.css';

.tabs {
  @apply grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-1;
}
.tabs a {
  @apply grid min-h-11 place-items-center rounded-xl text-sm font-semibold text-slate-500 transition;
}
.tabs a.active {
  @apply bg-indigo-100 text-indigo-800;
}
</style>
