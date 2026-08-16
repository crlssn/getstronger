<script setup lang="ts">
import type { Timestamp } from '@bufbuild/protobuf/wkt'
import type { User } from '@/proto/api/v1/shared_pb'

import { computed } from 'vue'
import { formatToRelativeDateTime } from '@/utils/datetime'

const props = defineProps<{
  comment: string
  timestamp?: Timestamp
  user?: User
}>()

const initials = computed(
  () => `${props.user?.firstName.charAt(0) ?? ''}${props.user?.lastName.charAt(0) ?? ''}` || 'GS',
)
</script>

<template>
  <article class="comment-row">
    <RouterLink
      :to="`/users/${user?.id}`"
      class="comment-avatar"
      :aria-label="`View ${user?.firstName} ${user?.lastName}'s profile`"
    >
      {{ initials }}
    </RouterLink>
    <div class="comment-content">
      <div class="comment-meta">
        <RouterLink :to="`/users/${user?.id}`"
          >{{ user?.firstName }} {{ user?.lastName }}</RouterLink
        >
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
  @apply grid size-11 place-items-center rounded-xl bg-indigo-100 text-xs font-semibold text-indigo-700;
}
.comment-content {
  @apply min-w-0;
}
.comment-meta {
  @apply flex flex-wrap items-baseline gap-x-2;
}
.comment-meta a {
  @apply -my-3 inline-flex min-h-(--size-control-sm) items-center py-3 text-sm font-semibold text-slate-900 hover:text-indigo-700;
}
.comment-meta time {
  @apply text-xs text-text-subtle;
}
.comment-content p {
  @apply mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700;
}
</style>
