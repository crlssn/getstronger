<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { ChevronLeftIcon } from '@heroicons/vue/24/outline'
import { usePageTitleStore } from '@/stores/pageTitle'
import { tabRootFor } from '@/router/tabs'
import ActionButton from '@/ui/components/ActionButton.vue'
import { useActionButton } from '@/stores/actionButton'

const actionButton = useActionButton()
const pageTitleStore = usePageTitleStore()
const route = useRoute()
const router = useRouter()

// This bar only renders on a screen pushed onto a tab, so there is always
// somewhere to go back to — but not always a history entry to go back through,
// because the screen may have been opened from a link or a bookmark.
const goBack = () => {
  if (window.history.state?.back) {
    router.back()
    return
  }
  router.push(tabRootFor(route.path))
}
</script>

<template>
  <header class="page-nav">
    <button type="button" class="back" :aria-label="$t('nav.back')" @click="goBack">
      <ChevronLeftIcon />
    </button>
    <!-- This is the page's title now, not a label above one: a pushed screen
         no longer repeats its name in the body. -->
    <h1>{{ pageTitleStore.pageTitle }}</h1>
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
.page-nav > h1 {
  @apply truncate text-center text-sm font-semibold text-text sm:text-base;
}
.back {
  @apply -ml-1 grid size-11 place-items-center rounded-control text-text-muted transition hover:bg-surface-sunken hover:text-text;
}
.back svg {
  @apply size-6;
}
.page-action {
  @apply flex min-h-11 items-center justify-end;
}
</style>
