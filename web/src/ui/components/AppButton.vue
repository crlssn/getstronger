<script setup lang="ts">
import { computed } from 'vue'

// Four roles, not six colours: primary (ink fill), secondary (white with an
// ink border), ghost (text only) and destructive (danger text, never a red
// fill). Anything that wants "a bit of colour" has no name to reach for.
const props = defineProps<{
  colour: 'primary' | 'secondary' | 'ghost' | 'destructive'
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
  @apply inline-flex min-h-(--size-control) w-full items-center justify-center gap-2 rounded-control border border-transparent px-4 py-3 text-sm font-semibold transition;
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

.secondary {
  @apply border-ink-border bg-white text-text hover:bg-ink-surface;
}

.ghost {
  @apply text-text-muted hover:bg-ink-surface hover:text-text;
}

.destructive {
  @apply text-danger hover:bg-danger-surface hover:text-danger-strong;
}
</style>
