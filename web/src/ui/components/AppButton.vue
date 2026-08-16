<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  colour: 'amber' | 'gray' | 'green' | 'primary' | 'red' | 'black'
  containerClass?: string
  to?: string
  type: 'button' | 'link' | 'submit'
}>()

const computedClasses = computed(() => {
  let linkClass
  if (props.type === 'link') {
    linkClass = `link`
  }

  return `${linkClass} ${props.colour}`
})
</script>

<template>
  <RouterLink v-if="props.type === 'link'" :to="props.to as string" :class="computedClasses">
    <slot />
  </RouterLink>
  <button v-else :type="props.type" :class="computedClasses">
    <slot />
  </button>
</template>

<style scoped>
@reference '../../assets/base.css';

a,
button {
  @apply inline-flex min-h-(--size-control) w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition;
}

.link {
  @apply block text-center py-3;
}

button:disabled {
  @apply cursor-not-allowed opacity-60;
}

.primary {
  @apply border-ink bg-ink text-white hover:bg-ink-strong;
}

.green {
  @apply border-success bg-success text-white hover:brightness-95;
}

.red {
  @apply border-red-200 bg-white text-red-600 hover:bg-red-50;
}

.amber {
  @apply border-achievement-600 bg-achievement-600 text-white hover:bg-achievement-700;
}

.gray {
  @apply border-slate-200 bg-white text-slate-700 hover:bg-slate-50;
}

.black {
  @apply border-surface-inverse bg-surface-inverse text-white hover:brightness-125;
}
</style>
