<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { DateTime } from 'luxon'
import { CheckIcon, FireIcon } from '@heroicons/vue/24/outline'

import { useStreakStore } from '@/stores/streak'

const { t } = useI18n()
const streakStore = useStreakStore()

onMounted(() => streakStore.load())

const streak = computed(() => streakStore.streak)
const thisWeekLogged = computed(() => streakStore.thisWeekLogged)
const title = computed(() => {
  if (!streak.value) return t('streak.startTitle')
  return thisWeekLogged.value ? t('streak.securedTitle') : t('streak.keepAliveTitle')
})
const message = computed(() => {
  if (!streak.value) return t('streak.startBody')
  return thisWeekLogged.value ? t('streak.securedBody') : t('streak.keepAliveBody')
})
const weekBlocks = computed(() =>
  Array.from({ length: 5 }, (_, index) => {
    const weeksAgo = 4 - index
    const week = DateTime.now().startOf('week').minus({ weeks: weeksAgo })
    const workoutCount = streakStore.weekWorkoutCounts[`${week.weekYear}-${week.weekNumber}`] ?? 0
    const complete = thisWeekLogged.value
      ? weeksAgo < streak.value
      : weeksAgo > 0 && weeksAgo <= streak.value
    const completedWorkoutCount = Math.max(1, workoutCount)

    return {
      complete,
      current: weeksAgo === 0,
      workoutCount,
      workoutCountDisplay: workoutCount >= 9 ? '9+' : `${workoutCount}`,
      label: weeksAgo === 0 ? t('streak.thisWeek') : t('streak.weeksAgo', weeksAgo),
      status: complete
        ? t('streak.workoutsLogged', completedWorkoutCount)
        : weeksAgo === 0
          ? t('streak.stillNeeded')
          : t('streak.outsideStreak'),
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
        <small class="eyebrow">{{ t('streak.eyebrow') }}</small>
        <strong>{{ title }}</strong>
      </div>
      <span v-if="streak > 0" class="streak-count"
        ><strong>{{ streak }}</strong
        ><small>{{ t('streak.weeks', streak) }}</small></span
      >
    </header>

    <div class="week-track" role="list" :aria-label="t('streak.trackAria')">
      <span
        v-for="week in weekBlocks"
        :key="week.label"
        role="listitem"
        class="week-block"
        :class="{ complete: week.complete, current: week.current }"
        :aria-label="`${week.label}: ${week.status}`"
      >
        <template v-if="week.complete">
          <CheckIcon />
          <strong v-if="week.workoutCount > 1" class="week-workout-count">
            {{ week.workoutCountDisplay }}
          </strong>
        </template>
        <span v-else aria-hidden="true"></span>
      </span>
    </div>
    <div class="track-labels" aria-hidden="true">
      <span>{{ t('streak.weeksAgo', 4) }}</span
      ><span>{{ t('streak.thisWeek') }}</span>
    </div>
    <p>{{ message }}</p>
  </section>
</template>

<style scoped>
@reference '../../assets/base.css';

.streak-card {
  @apply card p-4;
}
.streak-card header {
  @apply grid grid-cols-[auto_1fr_auto] items-center gap-3;
}
.streak-icon {
  @apply grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-500;
}
.streak-card.active .streak-icon {
  @apply bg-green-100 text-green-800;
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
  @apply flex h-9 items-center justify-center gap-1.5 rounded-lg bg-stone-200 text-stone-400;
}
.week-block.complete {
  @apply bg-green-800 text-white;
}
.week-block.current:not(.complete) {
  @apply bg-green-50 ring-2 ring-inset ring-green-700;
}
.week-block > svg {
  @apply size-4 stroke-[2.5];
}
.week-workout-count {
  @apply text-xs font-bold tabular-nums;
}
.week-block > span {
  @apply size-1.5 rounded-full bg-current;
}
.track-labels {
  /* slate-400 only reaches 2.6:1 against the card at this size. */
  @apply mt-1.5 flex justify-between text-[0.65rem] font-medium text-slate-500;
}
.streak-card > p {
  @apply mt-3 text-xs text-slate-500;
}
.streak-card.active:not(.safe) > p {
  @apply font-medium text-green-800;
}
.streak-count {
  @apply min-w-12 rounded-xl bg-green-50 px-2.5 py-1.5 text-center text-green-900;
}
.streak-count strong {
  @apply text-base font-bold leading-none;
}
.streak-count small {
  @apply mt-0.5 text-[0.6rem] font-semibold uppercase tracking-wide;
}
</style>
