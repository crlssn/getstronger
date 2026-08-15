<script setup lang="ts">
import { usePageTitleStore } from '@/stores/pageTitle'
import ActionButton from '@/ui/components/ActionButton.vue'
import { useActionButton } from '@/stores/actionButton'

const actionButton = useActionButton()
const pageTitleStore = usePageTitleStore()
</script>

<template>
  <header class="page-nav">
    <span aria-hidden="true"></span>
    <p>{{ pageTitleStore.pageTitle }}</p>
    <!-- Views can Teleport their own action (e.g. a dropdown) into this slot. -->
    <div id="page-nav-action" class="page-action">
      <ActionButton
        v-if="actionButton.active"
        :action="actionButton.action"
        :icon="actionButton.icon"
      />
    </div>
  </header>
</template>

<style scoped>
@reference '../../assets/base.css';

.page-nav {
  @apply mb-5 grid min-h-11 grid-cols-[2.75rem_1fr_2.75rem] items-center gap-3 px-1;
}
.page-nav > p {
  @apply truncate text-center text-sm font-semibold text-slate-900 sm:text-base;
}
.page-action {
  @apply flex min-h-11 items-center justify-end;
}
</style>
