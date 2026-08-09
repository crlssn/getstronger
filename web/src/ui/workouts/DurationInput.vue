<script setup lang="ts">
import { computed } from 'vue'
import { formatMeasurementDuration } from '@/utils/exerciseMeasurements'

const model = defineModel<number | undefined>()

const displayValue = computed({
  get: () => model.value === undefined ? '' : formatMeasurementDuration(model.value),
  set: (raw: string) => {
    const value = raw.trim()
    if (!value) {
      model.value = undefined
      return
    }
    const parts = value.split(':').map(Number)
    if (parts.some((part) => !Number.isFinite(part) || part < 0)) return
    model.value = parts.length === 1
      ? Math.round(parts[0])
      : Math.round(parts[0] * 60 + Math.min(parts[1], 59))
  },
})
</script>

<template>
  <input v-model="displayValue" type="text" inputmode="numeric" placeholder="m:ss" />
</template>
