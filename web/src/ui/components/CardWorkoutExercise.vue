<script setup lang="ts">
import type { Set } from '@/proto/api/v1/shared_pb'
import { TrophyIcon } from '@heroicons/vue/24/solid'

withDefaults(
  defineProps<{
    compact?: boolean
    exerciseId?: string
    label?: string
    name?: string
    sets: Set[]
  }>(),
  { compact: false },
)

const formatWeight = (weight: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(weight)

const setVolume = (set: Set) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(set.weight * set.reps)
</script>

<template>
  <article class="exercise-block" :class="{ compact }">
    <header>
      <div>
        <RouterLink :to="`/exercises/${exerciseId}`">{{ name }}</RouterLink>
        <span v-if="label" class="exercise-label">{{ label }}</span>
      </div>
      <span class="set-count">{{ sets.length }} {{ sets.length === 1 ? 'set' : 'sets' }}</span>
    </header>

    <div class="set-table" role="table" :aria-label="`${name} sets`">
      <div v-if="!compact" class="set-row table-head" role="row">
        <span role="columnheader">Set</span>
        <span role="columnheader">Weight</span>
        <span role="columnheader">Reps</span>
        <span role="columnheader">Volume</span>
        <span role="columnheader"></span>
      </div>
      <div v-for="(set, index) in sets" :key="set.id || index" class="set-row" role="row">
        <span class="set-number" role="cell">{{ index + 1 }}</span>
        <strong role="cell">{{ formatWeight(set.weight) }} <small>kg</small></strong>
        <span role="cell">× {{ set.reps }}</span>
        <span v-if="!compact" class="set-volume" role="cell">{{ setVolume(set) }} kg</span>
        <span v-if="set.metadata?.personalBest" class="pr-badge" role="cell">
          <TrophyIcon /> <span>PR</span>
        </span>
        <span v-else-if="!compact" role="cell"></span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.exercise-block { @apply overflow-hidden rounded-2xl border border-slate-200 bg-white; }
.exercise-block > header { @apply flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5; }
.exercise-block > header > div { @apply flex min-w-0 items-center gap-2; }
.exercise-block > header a { @apply truncate text-base font-semibold text-slate-950 transition hover:text-indigo-700; }
.exercise-label { @apply truncate rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500; }
.set-count { @apply shrink-0 text-xs font-medium text-slate-500; }
.set-table { @apply px-4 py-2 sm:px-5; }
.set-row { @apply grid min-h-11 grid-cols-[2.25rem_minmax(5rem,1fr)_minmax(4rem,.8fr)_minmax(5rem,1fr)_3.25rem] items-center gap-2 border-t border-slate-100 text-sm first:border-t-0; }
.table-head { @apply min-h-9 border-0 text-xs font-semibold uppercase tracking-wide text-slate-400; }
.set-number { @apply grid size-7 place-items-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500; }
.set-row strong { @apply font-semibold text-slate-900; }
.set-row small { @apply font-normal text-slate-500; }
.set-volume { @apply text-slate-500; }
.pr-badge { @apply inline-flex w-max items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700; }
.pr-badge svg { @apply size-3.5; }
.compact { @apply rounded-xl border-slate-100; }
.compact > header { @apply px-3 py-2.5; }
.compact .set-table { @apply px-3 py-1; }
.compact .set-row { @apply min-h-9 grid-cols-[1.75rem_minmax(4rem,1fr)_minmax(3rem,.7fr)_3rem] border-0; }
.compact .set-number { @apply size-6; }
.compact .pr-badge span { @apply sr-only; }
@media (max-width: 520px) {
  .set-row { @apply grid-cols-[2rem_minmax(4.5rem,1fr)_3.5rem_4.5rem_2.75rem] gap-1.5; }
  .set-row, .table-head { @apply text-xs; }
  .pr-badge { @apply px-1.5; }
  .pr-badge span { @apply sr-only; }
}
</style>
