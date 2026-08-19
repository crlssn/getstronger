<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { DateTime } from 'luxon'
import { ArrowTrendingUpIcon, ChevronRightIcon, TrophyIcon } from '@heroicons/vue/24/outline'

import { useDashboardStore } from '@/stores/dashboard'
import { useProgressStore } from '@/stores/progress'
import AppEmptyState from '@/ui/components/AppEmptyState.vue'
import WorkoutChart from '@/ui/components/WorkoutChart.vue'
import { formatToShortDateTime } from '@/utils/datetime'
import { formatNumber } from '@/utils/numbers'
import ExerciseTags from '@/ui/exercises/ExerciseTags.vue'
import { formatExerciseSet } from '@/utils/exerciseMeasurements'

const { t } = useI18n()
const dashboardStore = useDashboardStore()
const progressStore = useProgressStore()
const periodDays = ref(28)

onMounted(async () => {
  await Promise.all([dashboardStore.load(), progressStore.load()])
})

const dashboard = computed(() => dashboardStore.dashboard)
const totalRecords = computed(() => dashboard.value?.personalBests.length ?? 0)
const periodOptions = [
  { days: 7, label: '7D' },
  { days: 28, label: '4W' },
  { days: 90, label: '3M' },
  { days: 365, label: '1Y' },
]
const filteredWorkouts = computed(() => {
  const cutoff = DateTime.now().minus({ days: periodDays.value })
  return progressStore.workouts.filter((workout) => {
    if (!workout.finishedAt) return false
    return DateTime.fromSeconds(Number(workout.finishedAt.seconds)).toMillis() >= cutoff.toMillis()
  })
})
const filteredVolume = computed(() =>
  filteredWorkouts.value.reduce((total, workout) => total + workout.intensity, 0),
)
</script>

<template>
  <div class="progress-stack">
    <!-- Progress is a screen pushed onto the Me tab, so the nav bar above
         carries its title; the PB chip joins it in the title row. It only
         renders once there is something to celebrate, because a chip that
         exists to celebrate should not report a zero. -->
    <Teleport v-if="totalRecords > 0" to="#page-nav-action">
      <span class="record-count"
        ><TrophyIcon /> {{ t('progress.personalBests', totalRecords) }}</span
      >
    </Teleport>

    <!-- The card keys off the full year of history, not the selected range, so
         a range with no data keeps the picker on screen and says so instead of
         silently unmounting the controls. -->
    <section v-if="progressStore.workouts.length" class="chart-card">
      <div class="chart-heading">
        <div>
          <p class="eyebrow">{{ t('progress.trainingVolume') }}</p>
          <h2>{{ formatNumber(filteredVolume) }} {{ t('common.kg') }}</h2>
        </div>
        <span><ArrowTrendingUpIcon /> {{ t('progress.dailyTotals') }}</span>
      </div>
      <WorkoutChart v-if="filteredWorkouts.length" :workouts="filteredWorkouts" />
      <p v-else class="chart-empty">{{ t('progress.emptyRange') }}</p>
      <div class="period-picker segmented is-compact" :aria-label="t('progress.periodAria')">
        <button
          v-for="option in periodOptions"
          :key="option.days"
          type="button"
          :class="{ 'is-selected': periodDays === option.days }"
          :aria-pressed="periodDays === option.days"
          @click="periodDays = option.days"
        >
          {{ option.label }}
        </button>
      </div>
    </section>

    <section class="records-card">
      <div class="section-heading">
        <div>
          <p class="eyebrow">{{ t('progress.bestLifts') }}</p>
          <h2>{{ t('progress.personalRecords') }}</h2>
        </div>
      </div>
      <div v-if="dashboard?.personalBests.length" class="record-list">
        <RouterLink
          v-for="personalBest in dashboard.personalBests"
          :key="personalBest.set?.id"
          :to="`/exercises/${personalBest.exercise?.id}`"
        >
          <span class="record-icon"><TrophyIcon /></span>
          <span class="min-w-0">
            <strong>{{ personalBest.exercise?.name }}</strong>
            <ExerciseTags compact :tags="personalBest.exercise?.tags" />
            <small v-if="personalBest.set?.metadata?.createdAt">{{
              formatToShortDateTime(personalBest.set.metadata.createdAt)
            }}</small>
          </span>
          <span class="record-value">{{
            personalBest.set ? formatExerciseSet(personalBest.set, personalBest.exercise) : ''
          }}</span>
          <ChevronRightIcon class="chevron" />
        </RouterLink>
      </div>
      <AppEmptyState
        v-else
        :action="{ label: t('home.startWorkout'), to: '/workout' }"
        :body="t('progress.emptyBody')"
        :title="t('progress.emptyTitle')"
      >
        <template #icon><TrophyIcon /></template>
      </AppEmptyState>
    </section>
  </div>
</template>

<style scoped>
@reference '../assets/base.css';

.progress-stack {
  @apply space-y-5;
}
.eyebrow {
  @apply text-eyebrow font-bold uppercase text-text-subtle;
}
h1 {
  @apply mt-1 text-display font-bold text-text;
}
h2 {
  @apply mt-1 text-title font-semibold text-text;
}
.chart-heading h2 {
  @apply text-display font-bold;
}
.record-count {
  @apply inline-flex w-max items-center gap-1.5 whitespace-nowrap rounded-full border border-record-border bg-record-surface px-3 py-1.5 text-meta font-semibold text-record-strong;
}
.record-count svg {
  @apply size-5;
}
.chart-card,
.records-card {
  @apply card p-5;
}
.chart-heading {
  @apply mb-5 flex flex-wrap items-end justify-between gap-3;
}
.chart-heading > span {
  @apply inline-flex items-center gap-1.5 text-meta font-semibold text-text-subtle;
}
.chart-heading svg {
  @apply size-4;
}
.period-picker {
  @apply mt-4;
}
/* Same height as the chart frame, so switching to an empty range does not
   collapse the card under the reader's thumb. */
.chart-empty {
  @apply grid h-64 place-items-center text-sm text-text-subtle;
}
.section-heading {
  @apply mb-4;
}
.record-list {
  @apply divide-y divide-border;
}
.record-list a {
  @apply grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 py-4 first:pt-0 last:pb-0 transition hover:text-ink-strong;
}
.record-icon {
  @apply grid size-11 place-items-center rounded-control bg-record-surface text-record;
}
.record-icon svg,
.chevron {
  @apply size-5;
}
.record-list strong,
.record-list small {
  @apply block truncate;
}
.record-list small {
  @apply mt-1 text-sm text-text-subtle;
}
.record-value {
  @apply text-right text-sm font-semibold text-text;
}
.chevron {
  @apply text-text-subtle;
}
.empty-copy {
  @apply rounded-control bg-ink-surface p-4 text-sm text-text-subtle;
}
@media (max-width: 520px) {
  .record-list a {
    @apply grid-cols-[auto_1fr_auto];
  }
  .record-icon {
    @apply row-span-2;
  }
  .record-value {
    @apply col-start-2 row-start-2 text-left;
  }
  .chevron {
    @apply col-start-3 row-span-2 row-start-1;
  }
}
</style>
