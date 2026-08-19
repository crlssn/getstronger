<script setup lang="ts">
import { ExerciseMetric, type Set } from '@/proto/api/v1/shared_pb'
import { useI18n } from 'vue-i18n'
import { TrophyIcon } from '@heroicons/vue/24/solid'
import ExerciseTags from '@/ui/exercises/ExerciseTags.vue'
import {
  exerciseMetrics,
  formatDurationDisplay,
  formatExerciseSet,
  formatSetPace,
  isDistanceTimeExercise,
  measurementDefinitions,
} from '@/utils/exerciseMeasurements'
import { weightUnitLabel } from '@/utils/weightUnits'
import { distanceUnitLabel } from '@/utils/distanceUnits'

const { t } = useI18n()

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
const showPace = isDistanceTimeExercise({ metrics })

const formatValue = (set: Set, field: (typeof measurementDefinitions)[number]['field']) => {
  const value = set[field]
  if (field === 'durationSeconds') return formatDurationDisplay(value)
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
}

const columnLabel = (metric: ExerciseMetric) => {
  const definition = measurementDefinitions.find((measurement) => measurement.metric === metric)
  return definition ? t(definition.labelKey) : undefined
}
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
      :style="{ '--metric-count': measurements.length + (showPace ? 1 : 0) }"
    >
      <div v-if="!compact" class="set-row table-head" role="row">
        <span role="columnheader">Set</span>
        <span v-for="measurement in measurements" :key="measurement.field" role="columnheader">
          {{ columnLabel(measurement.metric) }}
        </span>
        <span v-if="showPace" role="columnheader">{{ t('common.pace') }}</span>
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
            <small v-if="measurement.field === 'weight'">
              {{ weightUnitLabel(set.weightUnit) }}
            </small>
            <small v-else-if="measurement.field === 'distance'">
              {{ distanceUnitLabel(set.distanceUnit) }}
            </small>
          </span>
          <span v-if="showPace" class="set-pace" role="cell">
            {{ formatSetPace(set) ?? '—' }}
          </span>
        </template>
      </div>
    </div>
  </article>
</template>

<style scoped>
@reference '../../assets/base.css';

.exercise-block {
  @apply card shadow-none overflow-hidden;
}
.exercise-block > header {
  @apply flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5;
}
.exercise-block > header > div {
  @apply flex min-w-0 items-center gap-2;
}
.exercise-block > header a {
  @apply -mx-1.5 -my-2.5 inline-flex min-h-(--size-control-sm) items-center truncate px-1.5 py-2.5 text-base font-semibold text-text transition hover:text-ink-strong;
}
.set-count {
  @apply shrink-0 text-xs font-medium text-text-subtle;
}
.set-table {
  @apply px-4 py-2 sm:px-5;
}
.set-row {
  grid-template-columns: 2.25rem repeat(var(--metric-count), minmax(4.5rem, 1fr));
  @apply grid min-h-11 items-center gap-2 border-t border-border text-sm first:border-t-0;
}
.table-head {
  @apply min-h-9 border-0 text-eyebrow font-semibold uppercase text-text-subtle;
}
.set-number {
  @apply grid size-7 place-items-center rounded-lg bg-info-surface text-xs font-semibold text-text-muted;
}
.set-number.personal-best {
  @apply bg-record-surface text-record-strong;
}
.set-number.personal-best svg {
  @apply size-4;
}
.set-row strong {
  @apply font-semibold text-text;
}
.set-row small {
  @apply ml-1 text-meta font-normal text-text-muted;
}
.set-volume {
  @apply text-text-subtle;
}
.set-pace {
  @apply text-text-muted;
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
  @apply text-text-muted;
}
.compact-set-value {
  @apply inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-text;
}
.compact-set-value > span {
  @apply font-medium;
}
.compact-set-value .compact-personal-best {
  @apply ml-0.5 grid size-6 place-items-center rounded-lg bg-record-surface text-record-strong;
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
