<script setup lang="ts">
import type { Timestamp } from '@bufbuild/protobuf/wkt'
import type { User } from '@/proto/api/v1/shared_pb'

import { computed } from 'vue'
import { formatToRelativeDateTime } from '@/utils/datetime'
import { initials } from '@/utils/names'

const props = defineProps<{
  comment: string
  timestamp?: Timestamp
  user?: User
}>()

const userInitials = computed(() => initials(props.user?.name) || 'GS')
</script>

<template>
  <article class="comment-row">
    <RouterLink
      :to="`/users/${user?.id}`"
      class="comment-avatar"
      :aria-label="$t('workout.card.viewProfile', { name: user?.name })"
    >
      {{ userInitials }}
    </RouterLink>
    <div class="comment-content">
      <div class="comment-meta">
        <RouterLink :to="`/users/${user?.id}`">{{ user?.name }}</RouterLink>
        <time>{{ formatToRelativeDateTime(timestamp) }}</time>
      </div>
      <p>{{ comment }}</p>
    </div>
  </article>
</template>

<style scoped>
@reference '../../assets/base.css';

.comment-row {
  @apply grid grid-cols-[auto_1fr] gap-3 py-4 first:pt-0 last:pb-0;
}
.comment-avatar {
  @apply grid size-11 place-items-center rounded-control bg-ink-tint text-xs font-semibold text-ink-strong;
}
.comment-content {
  @apply min-w-0;
}
.comment-meta {
  @apply flex flex-wrap items-baseline gap-x-2;
}
.comment-meta a {
  @apply -my-3 inline-flex min-h-(--size-control-sm) items-center py-3 text-sm font-semibold text-text hover:text-ink-strong;
}
.comment-meta time {
  @apply text-xs text-text-subtle;
}
.comment-content p {
  @apply mt-1 whitespace-pre-wrap text-sm leading-6 text-text-muted;
}
</style>
