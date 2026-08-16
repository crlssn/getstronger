<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { DateTime } from 'luxon'
import { ArrowTrendingUpIcon, ChevronRightIcon, TrophyIcon } from '@heroicons/vue/24/outline'

import { useDashboardStore } from '@/stores/dashboard'
import WorkoutChart from '@/ui/components/WorkoutChart.vue'
import { formatToShortDateTime } from '@/utils/datetime'
import ExerciseTags from '@/ui/exercises/ExerciseTags.vue'
import { formatExerciseSet } from '@/utils/exerciseMeasurements'

const { t } = useI18n()
const dashboardStore = useDashboardStore()
const periodDays = ref(28)

onMounted(async () => {
  await dashboardStore.load()
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
  return (
    dashboard.value?.recentWorkouts.filter((workout) => {
      if (!workout.finishedAt) return false
      return (
        DateTime.fromSeconds(Number(workout.finishedAt.seconds)).toMillis() >= cutoff.toMillis()
      )
    }) ?? []
  )
})
const filteredVolume = computed(() =>
  filteredWorkouts.value.reduce((total, workout) => total + workout.intensity, 0),
)
</script>

<template>
  <div class="progress-stack">
    <section class="progress-intro">
      <div>
        <p class="eyebrow">{{ t('progress.eyebrow') }}</p>
        <h1>{{ t('progress.heading') }}</h1>
      </div>
      <span class="record-count"
        ><TrophyIcon /> {{ t('progress.personalBests', totalRecords) }}</span
      >
    </section>

    <section v-if="filteredWorkouts.length" class="chart-card">
      <div class="chart-heading">
        <div>
          <p class="eyebrow">{{ t('progress.trainingVolume') }}</p>
          <h2>{{ Math.round(filteredVolume).toLocaleString() }} kg</h2>
        </div>
        <span><ArrowTrendingUpIcon /> {{ t('progress.dailyTotals') }}</span>
      </div>
      <WorkoutChart :workouts="filteredWorkouts" />
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
      <p v-else class="empty-copy">
        {{ t('progress.emptyBody') }}
      </p>
    </section>
  </div>
</template>

<style scoped>
@reference '../assets/base.css';

.progress-stack {
  @apply space-y-5;
}
.progress-intro {
  @apply flex flex-col gap-4 px-1 sm:flex-row sm:items-end sm:justify-between;
}
.eyebrow {
  @apply text-xs font-semibold uppercase tracking-wider text-slate-500;
}
h1 {
  @apply mt-1 text-2xl font-semibold tracking-tight text-slate-950;
}
h2 {
  @apply mt-1 text-xl font-semibold tracking-tight text-slate-950;
}
.record-count {
  @apply inline-flex w-max items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700;
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
  @apply inline-flex items-center gap-2 text-sm font-semibold text-indigo-700;
}
.chart-heading svg {
  @apply size-5;
}
.period-picker {
  @apply mt-4;
}
.section-heading {
  @apply mb-4;
}
.record-list {
  @apply divide-y divide-slate-100;
}
.record-list a {
  @apply grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 py-4 first:pt-0 last:pb-0 transition hover:text-indigo-700;
}
.record-icon {
  @apply grid size-11 place-items-center rounded-xl bg-amber-50 text-amber-600;
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
  @apply mt-1 text-sm text-slate-500;
}
.record-value {
  @apply text-right text-sm font-semibold text-slate-900;
}
.chevron {
  @apply text-slate-400;
}
.empty-copy {
  @apply rounded-xl bg-slate-50 p-4 text-sm text-slate-500;
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
