<script setup lang="ts">
import { PlusIcon } from '@heroicons/vue/24/outline'

// One quiet affordance for every optional addition: findable when looked for,
// never competing with the page's primary action.
defineProps<{ label: string; hint?: string }>()

const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <button type="button" class="optional-action" @click="emit('click')">
    <PlusIcon aria-hidden="true" />
    <span class="copy">
      <strong>{{ label }}</strong>
      <small v-if="hint">{{ hint }}</small>
    </span>
  </button>
</template>

<style scoped>
@reference '../../assets/base.css';

.optional-action {
  @apply flex min-h-(--size-control) w-full items-center justify-center gap-2 rounded-control border border-border bg-transparent px-4 py-2.5 text-text-muted transition hover:border-ink-border hover:bg-ink-surface/60 hover:text-text;
}
.optional-action svg {
  @apply size-5 shrink-0;
}
.copy {
  @apply min-w-0 text-center;
}
.copy strong {
  @apply block truncate text-sm font-semibold;
}
.copy small {
  @apply mt-0.5 block truncate text-xs font-normal text-text-subtle;
}
</style>
