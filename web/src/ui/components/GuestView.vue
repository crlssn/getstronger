<script setup lang="ts">
import AppAlert from '@/ui/components/AppAlert.vue'
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="guest-shell">
    <header class="guest-header">
      <RouterLink to="/login" class="guest-brand" aria-label="GetStronger login">
        <span class="guest-brand-mark"><img src="/favicon.png" alt="" /></span>
        <span>GetStronger</span>
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
  @apply mx-auto flex h-20 max-w-lg items-center justify-center gap-3 px-6 text-lg font-bold tracking-tight text-slate-950;
}
.guest-brand-mark {
  @apply grid size-11 place-items-center rounded-xl bg-indigo-600 shadow-sm shadow-indigo-200;
}
.guest-brand-mark img {
  @apply size-7 brightness-0 invert;
}
.guest-main {
  @apply mx-auto w-full max-w-lg px-6 py-10 sm:px-8 sm:py-14;
}
</style>
