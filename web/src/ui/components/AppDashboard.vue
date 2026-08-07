<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppAlert from '@/ui/components/AppAlert.vue'
import AppNavBottom from '@/ui/components/AppNavBottom.vue'
import AppNavTop from '@/ui/components/AppNavTop.vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const focusedWorkout = computed(() => route.name === 'workout-routine')
const routesWithoutPageNavigation = new Set([
  'home',
  'workout',
  'plans',
  'routines',
  'exercises',
  'profile',
])
const showsTopNavigation = computed(() => !routesWithoutPageNavigation.has(route.name as string))
const hidesBottomNavigation = computed(
  () => focusedWorkout.value || ['routine', 'view-workout'].includes(route.name as string),
)
</script>

<template>
  <div class="dashboard-shell" :class="{ 'dashboard-shell--without-tabs': hidesBottomNavigation }">
    <AppAlert />
    <main>
      <AppNavTop v-if="showsTopNavigation" />
      <RouterView />
    </main>
    <AppNavBottom v-if="!hidesBottomNavigation" />
  </div>
</template>

<style scoped>
.dashboard-shell {
  padding-bottom: calc(5.25rem + env(safe-area-inset-bottom));
}
.dashboard-shell--without-tabs {
  @apply pb-0;
}
main {
  @apply mx-auto w-full max-w-6xl px-3 py-5 sm:px-5 lg:px-8 lg:py-7;
}
</style>
