<script setup lang="ts">
import type { FunctionalComponent } from 'vue'

const props = defineProps<{
  action: () => void
  icon?: FunctionalComponent
}>()

const emits = defineEmits(['onClick'])

const onClick = async () => {
  props.action()
  emits('onClick')
}
</script>

<template>
  <button type="button" aria-label="Page action" @click="onClick">
    <component :is="props.icon" />
  </button>
</template>

<style scoped>
@reference '../../assets/base.css';

button {
  @apply grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-ink-border hover:bg-ink-surface hover:text-ink-strong;
}
svg {
  @apply size-5;
}
</style>
