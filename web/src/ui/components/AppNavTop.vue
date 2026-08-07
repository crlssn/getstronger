<script setup lang="ts">
import { usePageTitleStore } from '@/stores/pageTitle'
import { ArrowLeftIcon } from '@heroicons/vue/24/outline'
import ActionButton from '@/ui/components/ActionButton.vue'
import { useActionButton } from '@/stores/actionButton'
import { useRoute, useRouter } from 'vue-router'

const actionButton = useActionButton()
const pageTitleStore = usePageTitleStore()
const route = useRoute()
const router = useRouter()

const goBack = async () => {
  if (window.history.length > 1) {
    router.back()
    return
  }

  if (route.path === '/progress') await router.push('/profile')
  else if (route.path.startsWith('/plans/')) await router.push('/plans')
  else if (route.path.startsWith('/routines/')) await router.push('/routines')
  else if (route.path.startsWith('/exercises/')) await router.push('/exercises')
  else if (route.path.startsWith('/workouts/')) await router.push('/workout')
  else await router.push('/home')
}
</script>

<template>
  <nav class="page-nav" :aria-label="`Back from ${pageTitleStore.pageTitle}`">
    <button type="button" class="back-button" aria-label="Go back" @click="goBack">
      <ArrowLeftIcon />
    </button>
    <p>{{ pageTitleStore.pageTitle }}</p>
    <div class="page-action">
      <ActionButton
        v-if="actionButton.active"
        :action="actionButton.action"
        :icon="actionButton.icon"
      />
    </div>
  </nav>
</template>

<style scoped>
.page-nav {
  @apply mb-5 grid min-h-11 grid-cols-[2.75rem_1fr_2.75rem] items-center gap-3 px-1;
}
.page-nav > p {
  @apply truncate text-center text-sm font-semibold text-slate-900 sm:text-base;
}
.back-button {
  @apply grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700;
}
.back-button svg {
  @apply size-5;
}
.page-action {
  @apply flex min-h-11 items-center justify-end;
}
</style>
