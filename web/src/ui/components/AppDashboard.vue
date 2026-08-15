<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppAlert from '@/ui/components/AppAlert.vue'
import AppNavBottom from '@/ui/components/AppNavBottom.vue'
import AppNavTop from '@/ui/components/AppNavTop.vue'
import AppRestTimerBanner from '@/ui/components/AppRestTimerBanner.vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const routesWithoutPageNavigation = new Set([
  'home',
  'workout',
  'plans',
  'routines',
  'exercises',
  'profile',
  // Active sessions render their own sticky timer bar in place of the top nav.
  'workout-routine',
  'quick-workout',
])
const showsTopNavigation = computed(() => !routesWithoutPageNavigation.has(route.name as string))
</script>

<template>
  <div class="dashboard-shell">
    <AppAlert />
    <AppRestTimerBanner />
    <main>
      <AppNavTop v-if="showsTopNavigation" />
      <RouterView />
    </main>
    <AppNavBottom />
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.dashboard-shell {
  padding-bottom: calc(5.25rem + env(safe-area-inset-bottom));
}
main {
  @apply mx-auto w-full max-w-3xl px-3 py-5 sm:px-5 lg:px-8 lg:py-7;
}
</style>
