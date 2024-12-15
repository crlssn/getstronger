<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppAlert from '@/ui/components/AppAlert.vue'
import AppNavBottom from '@/ui/components/AppNavBottom.vue'
import AppNavTop from '@/ui/components/AppNavTop.vue'
import AppNavTabs from '@/ui/components/AppNavTabs.vue'
</script>

<template>
  <div class="pb-12">
    <AppNavTop />
    <AppNavTabs />
    <AppAlert />
    <main>
      <RouterView />
    </main>
    <AppNavBottom />
  </div>
</template>

<style scoped>
main {
  @apply mx-auto max-w-7xl bg-gray-100 py-4 px-2;
}
</style>
