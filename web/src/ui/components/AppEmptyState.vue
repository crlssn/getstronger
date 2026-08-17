<script setup lang="ts">
// Six dashed-border variants at three padding values and two backgrounds said
// the same thing six ways, and only one of them offered a way out.
//
// This is the one place in the design foundation where a component earns its
// keep over a CSS class, because the rule being enforced is editorial: always
// offer a next step. `action` is required — not required to exist, required to
// be decided. A screen with genuinely nowhere to go has to write action="none"
// in its own markup, where a reviewer will see the choice being made. A class
// cannot make anyone choose.
type Action = { label: string; to?: string }

defineProps<{
  action: Action | 'none'
  body?: string
  title: string
}>()

const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <div class="empty-state">
    <span v-if="$slots.icon" class="empty-icon"><slot name="icon" /></span>
    <h2>{{ title }}</h2>
    <p v-if="body">{{ body }}</p>
    <RouterLink v-if="action !== 'none' && action.to" :to="action.to" class="empty-action">
      <slot name="action-icon" />{{ action.label }}
    </RouterLink>
    <button
      v-else-if="action !== 'none'"
      type="button"
      class="empty-action"
      @click="emit('action')"
    >
      <slot name="action-icon" />{{ action.label }}
    </button>
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

/* A solid card, never dashed: dashed borders read as drop-zones, not states. */
.empty-state {
  @apply card grid justify-items-start gap-3 p-6;
}
.empty-icon {
  @apply grid size-11 place-items-center rounded-control bg-ink-tint text-text-muted;
}
.empty-icon :deep(svg) {
  @apply size-5;
}
.empty-state h2 {
  @apply text-body-lg font-semibold text-text;
}
.empty-state p {
  @apply text-sm leading-6 text-text-muted;
}
.empty-action {
  @apply mt-1 inline-flex min-h-(--size-control-sm) items-center gap-2 rounded-control bg-ink px-4 text-sm font-semibold text-white transition hover:brightness-125;
}
.empty-action :deep(svg) {
  @apply size-5;
}
</style>
