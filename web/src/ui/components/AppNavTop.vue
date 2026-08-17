<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ChevronLeftIcon } from '@heroicons/vue/24/outline'
import { usePageTitleStore } from '@/stores/pageTitle'
import { tabRootFor } from '@/router/tabs'
import ActionButton from '@/ui/components/ActionButton.vue'
import { useActionButton } from '@/stores/actionButton'

const { t } = useI18n()
const actionButton = useActionButton()
const pageTitleStore = usePageTitleStore()
const route = useRoute()
const router = useRouter()

// The back row names where back goes: the tab this screen was pushed onto.
const parentTabLabel = computed(() => {
  const labelKeys: Record<string, string> = {
    '/home': 'nav.home',
    '/workout': 'nav.workout',
    '/plans': 'nav.training',
    '/routines': 'nav.training',
    '/exercises': 'nav.exercises',
    '/profile': 'nav.me',
  }
  return t(labelKeys[tabRootFor(route.path)] ?? 'nav.home')
})

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
    <!-- A small back row above the title, not a centered bar around it: the
         chevron carries the parent tab's name so back says where it goes. -->
    <button type="button" class="back" @click="goBack">
      <ChevronLeftIcon /> {{ parentTabLabel }}
    </button>
    <div class="title-row">
      <h1>{{ pageTitleStore.pageTitle }}</h1>
      <!-- Views can Teleport their own action (e.g. a dropdown) into this slot. -->
      <div id="page-nav-action" class="page-action">
        <ActionButton
          v-if="actionButton.active"
          :action="actionButton.action"
          :icon="actionButton.icon"
        />
      </div>
    </div>
  </header>
</template>

<style scoped>
@reference '../../assets/base.css';

.page-nav {
  @apply mb-5 px-1;
}
.back {
  @apply -ml-2 inline-flex min-h-11 items-center gap-0.5 rounded-control pl-1 pr-3 text-sm font-semibold text-text-muted transition hover:bg-ink-surface hover:text-text;
}
.back svg {
  @apply size-5;
}
.title-row {
  @apply flex min-h-11 items-center justify-between gap-3;
}
.title-row > h1 {
  @apply min-w-0 truncate text-display font-bold text-text;
}
.page-action {
  @apply flex items-center justify-end empty:hidden;
}
</style>
