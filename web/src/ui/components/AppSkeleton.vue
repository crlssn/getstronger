<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// The shared pulsating placeholder for anything that fetches from the API.
// Screens drop it in behind their loading flag; the .loading-card class also
// doubles as the settle sentinel for the screenshot harness.
withDefaults(defineProps<{ lines?: number }>(), { lines: 3 })

const { t } = useI18n()
</script>

<template>
  <div class="loading-card" aria-busy="true" aria-live="polite">
    <span class="sr-only">{{ t('common.loading') }}</span>
    <div
      v-for="line in lines"
      :key="line"
      class="loading-line"
      :class="{ 'w-full': line === lines }"
      aria-hidden="true"
    ></div>
  </div>
</template>
