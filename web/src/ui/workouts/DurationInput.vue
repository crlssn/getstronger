<script setup lang="ts">
import { ref, watch } from 'vue'
import { formatMeasurementDuration } from '@/utils/exerciseMeasurements'

const model = defineModel<number | undefined>()

// The text is state of its own rather than a computed over the model: deriving
// it would reformat the field on every keystroke and rewrite what the user is
// typing. The model tracks the text; the text only snaps to the canonical
// format when the field is left.
const text = ref(model.value === undefined ? '' : formatMeasurementDuration(model.value))
const focused = ref(false)

const parseDuration = (raw: string): number | undefined => {
  const value = raw.trim()
  if (!value) return undefined

  if (value.includes(':')) {
    const [minutes = '0', seconds = '0'] = value.split(':')
    const parsedMinutes = Number(minutes || 0)
    const parsedSeconds = Number(seconds || 0)
    if (
      !Number.isFinite(parsedMinutes) ||
      !Number.isFinite(parsedSeconds) ||
      parsedMinutes < 0 ||
      parsedSeconds < 0
    ) {
      return model.value
    }
    return Math.round(parsedMinutes * 60 + Math.min(parsedSeconds, 59))
  }

  // Bare digits fill in from the right like a stopwatch: "45" is 45 seconds,
  // "130" is 1:30. Treating them as raw seconds ("130" = 2:10) surprises
  // anyone who typed what they read on a timer.
  const digits = value.replace(/\D/g, '')
  if (!digits) return model.value
  const seconds = Number(digits.slice(-2))
  const minutes = Number(digits.slice(0, -2) || 0)
  return minutes * 60 + seconds
}

// External writes (restoring a draft, copying the previous session's value on
// focus) must reach the display, but never rewrite text mid-typing.
watch(model, (value) => {
  if (focused.value && text.value.trim()) return
  text.value = value === undefined ? '' : formatMeasurementDuration(value)
})

const onInput = (event: Event) => {
  text.value = (event.target as HTMLInputElement).value
  model.value = parseDuration(text.value)
}

const onFocus = () => {
  focused.value = true
}

const onBlur = () => {
  focused.value = false
  text.value = model.value === undefined ? '' : formatMeasurementDuration(model.value)
}
</script>

<template>
  <input
    :value="text"
    type="text"
    inputmode="numeric"
    placeholder="m:ss"
    @input="onInput"
    @focus="onFocus"
    @blur="onBlur"
  />
</template>
