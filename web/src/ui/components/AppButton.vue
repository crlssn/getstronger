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
  @apply inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition;
}

.link {
  @apply block text-center py-3;
}

button:disabled {
  @apply cursor-not-allowed opacity-60;
}

.primary {
  @apply border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700;
}

.green {
  @apply border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700;
}

.red {
  @apply border-red-200 bg-white text-red-600 hover:bg-red-50;
}

.amber {
  @apply border-amber-600 bg-amber-600 text-white hover:bg-amber-700;
}

.gray {
  @apply border-slate-200 bg-white text-slate-700 hover:bg-slate-50;
}

.black {
  @apply border-slate-900 bg-slate-900 text-white hover:bg-slate-800;
}
</style>
