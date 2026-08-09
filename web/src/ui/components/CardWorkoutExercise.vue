<script setup lang="ts">
import { ExerciseMetric, type Set } from '@/proto/api/v1/shared_pb'
import { TrophyIcon } from '@heroicons/vue/24/solid'
import ExerciseTags from '@/ui/exercises/ExerciseTags.vue'
import {
  exerciseMetrics,
  formatExerciseSet,
  formatMeasurementDuration,
  measurementDefinitions,
} from '@/utils/exerciseMeasurements'

const props = withDefaults(
  defineProps<{
    compact?: boolean
    flat?: boolean
    exerciseId?: string
    name?: string
    sets: Set[]
    tags?: string[]
    metrics?: ExerciseMetric[]
  }>(),
  { compact: false, flat: false, tags: () => [] },
)

const metrics = exerciseMetrics({ metrics: props.metrics ?? [] })
const measurements = measurementDefinitions.filter(({ metric }) => metrics.includes(metric))

const formatValue = (set: Set, field: (typeof measurementDefinitions)[number]['field']) => {
  const value = set[field]
  if (field === 'durationSeconds') return formatMeasurementDuration(value)
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
}

const metricLabels: Partial<Record<ExerciseMetric, string>> = {
  [ExerciseMetric.WEIGHT]: 'Weight',
  [ExerciseMetric.REPS]: 'Reps',
  [ExerciseMetric.DISTANCE]: 'Distance',
  [ExerciseMetric.TIME]: 'Time',
}
const columnLabel = (metric: ExerciseMetric) => metricLabels[metric]
</script>

<template>
  <article class="exercise-block" :class="{ compact, flat }">
    <header>
      <div>
        <RouterLink :to="`/exercises/${exerciseId}`">{{ name }}</RouterLink>
        <ExerciseTags compact :tags="tags" />
      </div>
      <span v-if="!compact" class="set-count">
        {{ sets.length }} {{ sets.length === 1 ? 'set' : 'sets' }}
      </span>
    </header>

    <div
      class="set-table"
      role="table"
      :aria-label="`${name} sets`"
      :style="{ '--metric-count': measurements.length }"
    >
      <div v-if="!compact" class="set-row table-head" role="row">
        <span role="columnheader">Set</span>
        <span v-for="measurement in measurements" :key="measurement.field" role="columnheader">
          {{ columnLabel(measurement.metric) }}
        </span>
      </div>
      <div v-for="(set, index) in sets" :key="set.id || index" class="set-row" role="row">
        <span
          class="set-number"
          :class="{ 'personal-best': !compact && set.metadata?.personalBest }"
          role="cell"
          :aria-label="
            set.metadata?.personalBest ? `Set ${index + 1}, personal best` : `Set ${index + 1}`
          "
        >
          <template v-if="compact">{{ index + 1 }}</template>
          <TrophyIcon v-else-if="set.metadata?.personalBest" aria-hidden="true" />
          <template v-else>{{ index + 1 }}</template>
        </span>
        <span v-if="compact" class="compact-set-value" role="cell">
          <strong>{{ formatExerciseSet(set, { metrics }) }}</strong>
          <span
            v-if="set.metadata?.personalBest"
            class="compact-personal-best"
            role="img"
            aria-label="Personal best"
          >
            <TrophyIcon aria-hidden="true" />
          </span>
        </span>
        <template v-else>
          <span v-for="measurement in measurements" :key="measurement.field" role="cell">
            <strong>{{ formatValue(set, measurement.field) }}</strong>
            <small v-if="measurement.field === 'weight'"> kg</small>
            <small v-else-if="measurement.field === 'distance'"> km</small>
          </span>
        </template>
      </div>
    </div>
  </article>
</template>

<style scoped>
.exercise-block {
  @apply overflow-hidden rounded-2xl border border-slate-200 bg-white;
}
.exercise-block > header {
  @apply flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5;
}
.exercise-block > header > div {
  @apply flex min-w-0 items-center gap-2;
}
.exercise-block > header a {
  @apply truncate text-base font-semibold text-slate-950 transition hover:text-indigo-700;
}
.set-count {
  @apply shrink-0 text-xs font-medium text-slate-500;
}
.set-table {
  @apply px-4 py-2 sm:px-5;
}
.set-row {
  grid-template-columns: 2.25rem repeat(var(--metric-count), minmax(4.5rem, 1fr));
  @apply grid min-h-11 items-center gap-2 border-t border-slate-100 text-sm first:border-t-0;
}
.table-head {
  @apply min-h-9 border-0 text-xs font-semibold uppercase tracking-wide text-slate-400;
}
.set-number {
  @apply grid size-7 place-items-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500;
}
.set-number.personal-best {
  @apply bg-amber-50 text-amber-700;
}
.set-number.personal-best svg {
  @apply size-4;
}
.set-row strong {
  @apply font-semibold text-slate-900;
}
.set-row small {
  @apply font-normal text-slate-500;
}
.set-volume {
  @apply text-slate-500;
}
.flat {
  @apply rounded-none border-0;
}
.flat > header {
  @apply px-0 py-3;
}
.flat .set-table {
  @apply px-0 pb-4 pt-2;
}
.compact {
  @apply rounded-none border-0 bg-transparent py-3;
}
.compact > header {
  @apply min-w-0 border-0 px-0 py-0;
}
.compact > header a {
  @apply text-[0.9375rem];
}
.compact .set-table {
  @apply mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 px-0 py-0;
}
.compact .set-row {
  @apply min-h-8 grid-cols-[1.75rem_auto] justify-start gap-2 border-0;
}
.compact .set-number {
  @apply size-6;
}
.compact .set-row small {
  @apply text-slate-600;
}
.compact-set-value {
  @apply inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-slate-900;
}
.compact-set-value > span {
  @apply font-medium;
}
.compact-set-value .compact-personal-best {
  @apply ml-0.5 grid size-6 place-items-center rounded-lg bg-amber-50 text-amber-700;
}
.compact-personal-best svg {
  @apply size-4;
}
@media (max-width: 520px) {
  .set-row {
    grid-template-columns: 2rem repeat(var(--metric-count), minmax(3.75rem, 1fr));
    @apply gap-1.5;
  }
  .set-row,
  .table-head {
    @apply text-xs;
  }
}
</style>
