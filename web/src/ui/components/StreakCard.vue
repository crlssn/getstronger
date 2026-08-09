<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { CheckIcon, FireIcon } from '@heroicons/vue/24/outline'

import { useStreakStore } from '@/stores/streak'

const streakStore = useStreakStore()

onMounted(() => streakStore.load())

const streak = computed(() => streakStore.streak)
const thisWeekLogged = computed(() => streakStore.thisWeekLogged)
const title = computed(() => {
  if (!streak.value) return 'Start your streak'
  return thisWeekLogged.value ? 'Streak secured' : 'Keep your streak alive'
})
const message = computed(() => {
  if (!streak.value) return 'Log one workout a week to build a streak.'
  return thisWeekLogged.value
    ? 'This week is in the bag. Keep it rolling next week.'
    : 'Log a workout this week to keep your streak alive.'
})
const weekBlocks = computed(() =>
  Array.from({ length: 5 }, (_, index) => {
    const weeksAgo = 4 - index
    const complete = thisWeekLogged.value
      ? weeksAgo < streak.value
      : weeksAgo > 0 && weeksAgo <= streak.value

    return {
      complete,
      current: weeksAgo === 0,
      label: weeksAgo === 0 ? 'This week' : `${weeksAgo} ${weeksAgo === 1 ? 'week' : 'weeks'} ago`,
      status: complete
        ? 'workout logged'
        : weeksAgo === 0
          ? 'workout still needed'
          : 'outside current streak',
    }
  }),
)
</script>

<template>
  <section
    v-if="streakStore.loaded && !streakStore.failed"
    class="streak-card"
    :class="{ active: streak > 0, safe: thisWeekLogged }"
  >
    <header>
      <span class="streak-icon"><FireIcon /></span>
      <div class="min-w-0">
        <small class="eyebrow">Weekly streak</small>
        <strong>{{ title }}</strong>
      </div>
      <span v-if="streak > 0" class="streak-count"
        ><strong>{{ streak }}</strong><small>{{ streak === 1 ? 'week' : 'weeks' }}</small></span
      >
    </header>

    <div class="week-track" role="list" aria-label="Your last five training weeks">
      <span
        v-for="week in weekBlocks"
        :key="week.label"
        role="listitem"
        class="week-block"
        :class="{ complete: week.complete, current: week.current }"
        :aria-label="`${week.label}: ${week.status}`"
      >
        <CheckIcon v-if="week.complete" />
        <span v-else aria-hidden="true"></span>
      </span>
    </div>
    <div class="track-labels" aria-hidden="true"><span>4 weeks ago</span><span>This week</span></div>
    <p>{{ message }}</p>
  </section>
</template>

<style scoped>
.streak-card {
  @apply rounded-2xl border border-slate-200 bg-white p-4 shadow-sm;
}
.streak-card header {
  @apply grid grid-cols-[auto_1fr_auto] items-center gap-3;
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
.streak-card header strong,
.streak-card header small {
  @apply block truncate;
}
.streak-card header > div > strong {
  @apply text-sm font-semibold text-slate-950;
}
.streak-card .eyebrow {
  @apply mb-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500;
}
.week-track {
  @apply mt-4 grid grid-cols-5 gap-1 rounded-xl bg-stone-100 p-1;
}
.week-block {
  @apply grid h-9 place-items-center rounded-lg bg-stone-200 text-stone-400;
}
.week-block.complete {
  @apply bg-amber-400 text-stone-950;
}
.week-block.current:not(.complete) {
  @apply bg-amber-50 ring-2 ring-inset ring-amber-400;
}
.week-block > svg {
  @apply size-4 stroke-[2.5];
}
.week-block > span {
  @apply size-1.5 rounded-full bg-current;
}
.track-labels {
  @apply mt-1.5 flex justify-between text-[0.65rem] font-medium text-slate-400;
}
.streak-card > p {
  @apply mt-3 text-xs text-slate-500;
}
.streak-card.active:not(.safe) > p {
  @apply font-medium text-amber-700;
}
.streak-count {
  @apply min-w-12 rounded-xl bg-amber-50 px-2.5 py-1.5 text-center text-amber-800;
}
.streak-count strong {
  @apply text-base font-bold leading-none;
}
.streak-count small {
  @apply mt-0.5 text-[0.6rem] font-semibold uppercase tracking-wide;
}
</style>
