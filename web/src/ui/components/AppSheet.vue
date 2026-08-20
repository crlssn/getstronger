<script setup lang="ts">
import { onMounted, onUnmounted, useId } from 'vue'
import { XMarkIcon } from '@heroicons/vue/24/outline'

// One bottom sheet for every modal surface: drag handle, optional eyebrow,
// title, body copy, a content region for list-style sheets, and stacked
// full-width actions. It sits flush with the bottom edge of the viewport.
withDefaults(
  defineProps<{
    title: string
    eyebrow?: string
    eyebrowTone?: 'default' | 'success' | 'danger'
    body?: string
    closeLabel?: string
  }>(),
  { body: undefined, closeLabel: undefined, eyebrow: undefined, eyebrowTone: 'default' },
)

const emit = defineEmits<{ close: [] }>()
const titleId = useId()

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="sheet-backdrop" @click.self="emit('close')">
    <section class="sheet-panel" role="dialog" aria-modal="true" :aria-labelledby="titleId">
      <span class="sheet-handle" aria-hidden="true"></span>
      <header class="sheet-header">
        <div class="min-w-0">
          <p v-if="eyebrow" class="sheet-eyebrow" :class="eyebrowTone">{{ eyebrow }}</p>
          <h2 :id="titleId">{{ title }}</h2>
        </div>
        <button
          v-if="closeLabel"
          type="button"
          class="sheet-close"
          :aria-label="closeLabel"
          @click="emit('close')"
        >
          <XMarkIcon />
        </button>
      </header>
      <p v-if="body" class="sheet-body">{{ body }}</p>
      <div v-if="$slots.default" class="sheet-content">
        <slot />
      </div>
      <div v-if="$slots.actions" class="sheet-actions">
        <slot name="actions" />
      </div>
    </section>
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.sheet-backdrop {
  @apply fixed inset-0 z-50 flex items-end justify-center bg-ink-strong/40 sm:items-center sm:p-6;
}
/* Flush with the bottom edge: only the top corners round, and the safe-area
   inset is padding inside the sheet so nothing shows through beneath it. */
.sheet-panel {
  @apply flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-sheet bg-white px-5 pt-5 text-left shadow-overlay sm:max-h-[75vh] sm:rounded-sheet sm:pb-5;
  padding-bottom: calc(1.25rem + env(safe-area-inset-bottom));
}
.sheet-handle {
  @apply mx-auto mb-4 block h-1 w-12 shrink-0 rounded-full bg-ink-tint sm:hidden;
}
.sheet-header {
  @apply flex items-center justify-between gap-4;
}
.sheet-eyebrow {
  @apply text-eyebrow font-bold uppercase text-text-subtle;
}
.sheet-eyebrow.success {
  @apply text-success;
}
.sheet-eyebrow.danger {
  @apply text-danger;
}
.sheet-header h2 {
  @apply mt-1 text-title font-semibold text-text;
}
.sheet-close {
  @apply grid size-11 shrink-0 place-items-center rounded-control border border-border text-text-subtle;
}
.sheet-close svg {
  @apply size-5;
}
.sheet-body {
  @apply mt-2 text-sm leading-6 text-text-muted;
}
.sheet-content {
  @apply mt-4 min-h-0 flex-1 overflow-y-auto;
}
.sheet-actions {
  @apply mt-4 grid gap-2;
}
/* The action ranking is part of the sheet's design, so the button styles live
   here rather than being restated by every caller: a dark primary, a solid or
   outlined destructive, and a plain outlined tertiary. */
.sheet-actions :slotted(button) {
  @apply inline-flex min-h-(--size-control) w-full items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold transition;
}
.sheet-actions :slotted(button) svg {
  @apply size-5;
}
.sheet-actions :slotted(button:disabled) {
  @apply opacity-60;
}
.sheet-actions :slotted(button.primary) {
  @apply bg-ink text-white hover:bg-ink-strong;
}
.sheet-actions :slotted(button.danger) {
  @apply bg-danger text-white hover:bg-danger-strong;
}
.sheet-actions :slotted(button.danger-outline) {
  @apply border border-danger/30 text-danger hover:bg-danger-surface hover:text-danger-strong;
}
.sheet-actions :slotted(button.tertiary) {
  @apply border border-border text-text-muted hover:bg-ink-surface;
}
</style>
