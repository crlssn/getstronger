<script setup lang="ts">
import AppAlert from '@/ui/components/AppAlert.vue'
import { RouterLink, RouterView } from 'vue-router'
import { brandName, brandNameParts, brandSlogan } from '@/brand'
</script>

<template>
  <div class="guest-shell">
    <header class="guest-header">
      <RouterLink
        to="/login"
        class="guest-brand"
        :aria-label="$t('auth.loginTitle', { brand: brandName })"
      >
        <span class="guest-brand-mark"><img src="/favicon.png" alt="" /></span>
        <span class="guest-brand-copy">
          <strong
            ><span>{{ brandNameParts[0] }}</span
            >{{ brandNameParts[1] }}</strong
          >
          <span>{{ brandSlogan }}</span>
        </span>
      </RouterLink>
    </header>
    <AppAlert />
    <main class="guest-main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.guest-shell {
  @apply min-h-screen bg-surface-sunken;
}
.guest-header {
  @apply border-b border-border bg-white;
}
.guest-brand {
  @apply mx-auto flex min-h-24 max-w-lg items-center justify-start gap-3 px-6 py-4 text-text;
}
.guest-brand-mark {
  @apply grid size-11 place-items-center rounded-control bg-ink shadow-card shadow-ink-border;
}
.guest-brand-mark img {
  @apply size-7 brightness-0 invert;
}
.guest-brand-copy {
  @apply flex flex-col;
}
.guest-brand-copy strong {
  @apply text-lg font-bold leading-6 tracking-tight;
}
.guest-brand-copy strong span {
  @apply font-semibold;
}
.guest-brand-copy > span {
  @apply text-sm font-bold leading-5 text-text-subtle;
}
.guest-main {
  @apply mx-auto w-full max-w-lg px-6 py-10 sm:px-8 sm:py-14;
}
/* The alert spans the viewport, but its contents belong to the same column as
   the brand and the form below it. */
.guest-shell :deep(.alert-card-inner) {
  @apply max-w-lg px-6 sm:px-8;
}
</style>
