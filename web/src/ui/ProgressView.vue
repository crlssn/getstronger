<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ArrowTrendingUpIcon, ChevronRightIcon, TrophyIcon } from '@heroicons/vue/24/outline'

import { useDashboardStore } from '@/stores/dashboard'
import WorkoutChart from '@/ui/components/WorkoutChart.vue'
import { formatToShortDateTime } from '@/utils/datetime'

const dashboardStore = useDashboardStore()

onMounted(async () => {
  await dashboardStore.load()
})

const dashboard = computed(() => dashboardStore.dashboard)
const totalRecords = computed(() => dashboard.value?.personalBests.length ?? 0)
const formatWeight = (weight: number | undefined) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(weight ?? 0)
</script>

<template>
  <div class="progress-stack">
    <section class="progress-intro">
      <div>
        <p class="eyebrow">Performance</p>
        <h1>See the work paying off</h1>
        <p>Track volume and personal records without mixing incompatible measures.</p>
      </div>
      <span class="record-count"><TrophyIcon /> {{ totalRecords }} personal bests</span>
    </section>

    <section v-if="dashboard?.recentWorkouts.length && dashboard.recentWorkouts.length > 1" class="chart-card">
      <div class="chart-heading">
        <div>
          <p class="eyebrow">Training volume</p>
          <h2>{{ Math.round(dashboard.volumeThisWeek).toLocaleString() }} kg this week</h2>
        </div>
        <span><ArrowTrendingUpIcon /> Recent sessions</span>
      </div>
      <WorkoutChart :workouts="dashboard.recentWorkouts" />
    </section>

    <section class="records-card">
      <div class="section-heading">
        <div><p class="eyebrow">Best lifts</p><h2>Personal records</h2></div>
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
            <small v-if="personalBest.set?.metadata?.createdAt">{{ formatToShortDateTime(personalBest.set.metadata.createdAt) }}</small>
          </span>
          <span class="record-value">{{ formatWeight(personalBest.set?.weight) }} kg × {{ personalBest.set?.reps }}</span>
          <ChevronRightIcon class="chevron" />
        </RouterLink>
      </div>
      <p v-else class="empty-copy">Complete workouts to start building your personal-best history.</p>
    </section>
  </div>
</template>

<style scoped>
.progress-stack { @apply space-y-5; }
.progress-intro { @apply flex flex-col gap-4 px-1 sm:flex-row sm:items-end sm:justify-between; }
.eyebrow { @apply text-xs font-semibold uppercase tracking-wider text-slate-500; }
h1 { @apply mt-1 text-2xl font-semibold tracking-tight text-slate-950; }
h2 { @apply mt-1 text-xl font-semibold tracking-tight text-slate-950; }
.progress-intro p:last-child { @apply mt-2 max-w-xl text-sm text-slate-500; }
.record-count { @apply inline-flex w-max items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700; }
.record-count svg { @apply size-5; }
.chart-card, .records-card { @apply rounded-2xl border border-slate-200 bg-white p-5 shadow-sm; }
.chart-heading { @apply mb-5 flex flex-wrap items-end justify-between gap-3; }
.chart-heading > span { @apply inline-flex items-center gap-2 text-sm font-semibold text-indigo-700; }
.chart-heading svg { @apply size-5; }
.section-heading { @apply mb-4; }
.record-list { @apply divide-y divide-slate-100; }
.record-list a { @apply grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 py-4 first:pt-0 last:pb-0 transition hover:text-indigo-700; }
.record-icon { @apply grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600; }
.record-icon svg, .chevron { @apply size-5; }
.record-list strong, .record-list small { @apply block truncate; }
.record-list small { @apply mt-1 text-sm text-slate-500; }
.record-value { @apply text-right text-sm font-semibold text-slate-900; }
.chevron { @apply text-slate-400; }
.empty-copy { @apply rounded-xl bg-slate-50 p-4 text-sm text-slate-500; }
@media (max-width: 520px) {
  .record-list a { @apply grid-cols-[auto_1fr_auto]; }
  .record-icon { @apply row-span-2; }
  .record-value { @apply col-start-2 row-start-2 text-left; }
  .chevron { @apply col-start-3 row-span-2 row-start-1; }
}
</style>
