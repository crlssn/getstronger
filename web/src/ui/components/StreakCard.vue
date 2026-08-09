<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { FireIcon } from '@heroicons/vue/24/outline'

import { useStreakStore } from '@/stores/streak'

const streakStore = useStreakStore()

onMounted(() => streakStore.load())

const streak = computed(() => streakStore.streak)
const thisWeekLogged = computed(() => streakStore.thisWeekLogged)
const title = computed(() => (streak.value > 0 ? `${streak.value}-week streak` : 'Start a streak'))
const message = computed(() => {
  if (!streak.value) return 'Log one workout a week to build a streak.'
  return thisWeekLogged.value
    ? 'This week is in the bag. Keep it rolling next week.'
    : 'Log a workout this week to keep your streak alive.'
})
</script>

<template>
  <section
    v-if="streakStore.loaded && !streakStore.failed"
    class="streak-card"
    :class="{ active: streak > 0, safe: thisWeekLogged }"
  >
    <span class="streak-icon"><FireIcon /></span>
    <div class="min-w-0">
      <strong>{{ title }}</strong>
      <small>{{ message }}</small>
    </div>
    <span v-if="streak > 0" class="streak-count">{{ streak }}</span>
  </section>
</template>

<style scoped>
.streak-card {
  @apply grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm;
}
.streak-icon {
  @apply grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-500;
}
.streak-card.active .streak-icon {
  @apply bg-amber-100 text-amber-600;
}
.streak-icon svg {
  @apply size-6;
}
.streak-card strong,
.streak-card small {
  @apply block truncate;
}
.streak-card strong {
  @apply text-sm font-semibold text-slate-950;
}
.streak-card small {
  @apply mt-0.5 whitespace-normal text-xs text-slate-500;
}
.streak-card.active:not(.safe) small {
  @apply font-medium text-amber-700;
}
.streak-count {
  @apply grid size-9 place-items-center rounded-full bg-amber-50 text-sm font-bold text-amber-700;
}
</style>
