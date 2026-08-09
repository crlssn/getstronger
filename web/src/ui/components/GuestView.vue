<script setup lang="ts">
import AppAlert from '@/ui/components/AppAlert.vue'
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="guest-shell">
    <header class="guest-header">
      <RouterLink to="/login" class="guest-brand" :aria-label="$t('auth.loginTitle')">
        <span class="guest-brand-mark"><img src="/favicon.png" alt="" /></span>
        <span class="guest-brand-copy">
          <strong>One More Rep</strong>
          <span>{{ $t('auth.brandTagline') }}</span>
        </span>
      </RouterLink>
    </header>
    <AppAlert fixed />
    <main class="guest-main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.guest-shell {
  @apply min-h-screen bg-slate-50;
}
.guest-header {
  @apply border-b border-slate-200 bg-white;
}
.guest-brand {
  @apply mx-auto flex min-h-24 max-w-lg items-center justify-start gap-3 px-6 py-4 text-slate-950;
}
.guest-brand-mark {
  @apply grid size-11 place-items-center rounded-xl bg-indigo-600 shadow-sm shadow-indigo-200;
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
.guest-brand-copy > span {
  @apply text-xs font-medium leading-5 text-slate-500;
}
.guest-main {
  @apply mx-auto w-full max-w-lg px-6 py-10 sm:px-8 sm:py-14;
}
</style>
