<script setup lang="ts">
import { usePageTitleStore } from '@/stores/pageTitle'
import { ArrowLeftIcon } from '@heroicons/vue/24/outline'
import ActionButton from '@/ui/components/ActionButton.vue'
import { useActionButton } from '@/stores/actionButton'
import { backDestinationFor } from '@/router/backDestination'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const actionButton = useActionButton()
const pageTitleStore = usePageTitleStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const backDestination = computed(() => backDestinationFor(route))
const backLabel = computed(() => t(backDestination.value.labelKey))

const goBack = async () => {
  await router.push(backDestination.value.path)
}
</script>

<template>
  <nav class="page-nav" :aria-label="`Back from ${pageTitleStore.pageTitle}`">
    <button
      type="button"
      class="back-button"
      :aria-label="backLabel"
      :title="backLabel"
      @click="goBack"
    >
      <ArrowLeftIcon />
    </button>
    <p>{{ pageTitleStore.pageTitle }}</p>
    <!-- Views can Teleport their own action (e.g. a dropdown) into this slot. -->
    <div id="page-nav-action" class="page-action">
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
