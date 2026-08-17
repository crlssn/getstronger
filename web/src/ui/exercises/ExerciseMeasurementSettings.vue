<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ExerciseMetric } from '@/proto/api/v1/shared_pb'
import { usePreferencesStore } from '@/stores/preferences'
import { weightUnitLabel } from '@/utils/weightUnits'
import { distanceUnitLabel } from '@/utils/distanceUnits'

const { t } = useI18n()
const preferencesStore = usePreferencesStore()

const metrics = defineModel<ExerciseMetric[]>('metrics', { required: true })
const restSeconds = defineModel<number>('restSeconds', { required: true })

// The unit hints reflect the signed-in user's preferences so the card shows
// what a set of this exercise will actually be logged in.
const measurements = computed(() => [
  {
    value: ExerciseMetric.WEIGHT,
    label: t('common.weight'),
    unit: weightUnitLabel(preferencesStore.weightUnit),
  },
  {
    value: ExerciseMetric.REPS,
    label: t('common.reps'),
    unit: t('exercise.measurements.unitCount'),
  },
  {
    value: ExerciseMetric.DISTANCE,
    label: t('common.distance'),
    unit: distanceUnitLabel(preferencesStore.distanceUnit),
  },
  {
    value: ExerciseMetric.TIME,
    label: t('common.time'),
    unit: t('exercise.measurements.unitMinSec'),
  },
])

const presets = computed(() => [
  {
    label: t('exercise.measurements.presetWeightReps'),
    values: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
  },
  {
    label: t('exercise.measurements.presetDistanceTime'),
    values: [ExerciseMetric.DISTANCE, ExerciseMetric.TIME],
  },
  { label: t('exercise.measurements.presetRepsOnly'), values: [ExerciseMetric.REPS] },
  { label: t('exercise.measurements.presetTimed'), values: [ExerciseMetric.TIME] },
])

const restEnabled = computed({
  get: () => restSeconds.value > 0,
  set: (enabled: boolean) => (restSeconds.value = enabled ? 90 : 0),
})

// Every 30 seconds up to five minutes, so any common rest length is one tap.
const restPresets = Array.from({ length: 10 }, (_, index) => (index + 1) * 30)
const formatRest = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

function sameMetrics(values: ExerciseMetric[]) {
  return (
    values.length === metrics.value.length && values.every((value) => metrics.value.includes(value))
  )
}

function toggleMetric(metric: ExerciseMetric) {
  if (metrics.value.includes(metric)) {
    if (metrics.value.length === 1) return
    metrics.value = metrics.value.filter((value) => value !== metric)
    return
  }
  metrics.value = [...metrics.value, metric]
}
</script>

<template>
  <section class="measurement-settings">
    <div>
      <h3>{{ t('exercise.measurements.heading') }}</h3>
      <p>{{ t('exercise.measurements.help') }}</p>
    </div>

    <div class="presets segmented" :aria-label="t('exercise.measurements.presetsAria')">
      <button
        v-for="preset in presets"
        :key="preset.label"
        type="button"
        :class="{ 'is-selected': sameMetrics(preset.values) }"
        :aria-pressed="sameMetrics(preset.values)"
        @click="metrics = [...preset.values]"
      >
        {{ preset.label }}
      </button>
    </div>

    <div class="measurement-grid">
      <button
        v-for="measurement in measurements"
        :key="measurement.value"
        type="button"
        class="measurement"
        :class="{ selected: metrics.includes(measurement.value) }"
        :aria-pressed="metrics.includes(measurement.value)"
        @click="toggleMetric(measurement.value)"
      >
        <span class="check">{{ metrics.includes(measurement.value) ? '✓' : '+' }}</span>
        <span>
          <strong>{{ measurement.label }}</strong>
          <small>{{ measurement.unit }}</small>
        </span>
      </button>
    </div>

    <div class="rest-setting">
      <div>
        <strong>{{ t('exercise.restTimer') }}</strong>
        <small>{{ t('exercise.measurements.restHelp') }}</small>
      </div>
      <button
        type="button"
        role="switch"
        class="switch"
        :aria-checked="restEnabled"
        :aria-label="t('exercise.restTimer')"
        @click="restEnabled = !restEnabled"
      >
        <span class="knob"></span>
      </button>
    </div>

    <div v-if="restEnabled" class="rest-options">
      <button
        v-for="seconds in restPresets"
        :key="seconds"
        type="button"
        :aria-pressed="restSeconds === seconds"
        :class="{ selected: restSeconds === seconds }"
        @click="restSeconds = seconds"
      >
        {{ formatRest(seconds) }}
      </button>
    </div>
  </section>
</template>

<style scoped>
@reference '../../assets/base.css';

.measurement-settings {
  @apply space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm;
}
h3 {
  @apply text-xl font-bold text-slate-950;
}
p,
small {
  @apply block text-sm text-slate-500;
}
.rest-options {
  @apply flex flex-wrap gap-2;
}
.rest-options button {
  @apply inline-flex min-h-(--size-control-sm) items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600;
}
.rest-options button.selected {
  @apply border-surface-inverse bg-surface-inverse text-white;
}
.measurement-grid {
  @apply grid grid-cols-2 gap-3;
}
.measurement {
  @apply flex min-h-(--size-control-sm) items-center gap-3 rounded-2xl border border-slate-200 p-4 text-left;
}
.measurement.selected {
  @apply border-surface-inverse bg-surface-sunken;
}
.measurement strong {
  @apply block text-base text-slate-950;
}
.check {
  @apply flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold;
}
.measurement.selected .check {
  @apply bg-surface-inverse text-white;
}
.rest-setting {
  @apply flex items-center justify-between border-t border-slate-100 pt-5;
}
.rest-setting strong {
  @apply block text-base text-slate-950;
}
/* A real track-and-knob switch: the old pill read as a button. The track is
   drawn rather than being the button itself, so the control can be the full
   tap-target height to a thumb while still reading as a 32px switch. */
.switch {
  @apply relative inline-flex min-h-(--size-control-sm) w-14 shrink-0 cursor-pointer items-center;
}
.switch::before {
  @apply absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 rounded-full bg-slate-200 transition-colors content-[''];
}
.switch[aria-checked='true']::before {
  @apply bg-surface-inverse;
}
.knob {
  @apply absolute left-1 top-1/2 size-6 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform;
}
.switch[aria-checked='true'] .knob {
  @apply translate-x-6;
}
</style>
