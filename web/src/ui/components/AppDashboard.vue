<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppAlert from '@/ui/components/AppAlert.vue'
import AppNavBottom from '@/ui/components/AppNavBottom.vue'
import AppNavTop from '@/ui/components/AppNavTop.vue'
import AppRestTimerBanner from '@/ui/components/AppRestTimerBanner.vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { isTabRoot } from '@/router/tabs'

const route = useRoute()
// An active workout takes over the whole screen: the global tab bar would
// steal logging space and invite accidental mid-workout navigation, so the
// focused shell hides it until the user leaves or completes the session. It is
// declared on the route rather than listed here, so the shell cannot disagree
// with the router about which screens it applies to.
const focusedShell = computed(() => route.meta.focusedShell === true)
// Split by depth, not by name. A tab root opens with its own large title; a
// screen pushed on top of one gets the nav bar and a way back.
const showsTopNavigation = computed(() => !focusedShell.value && !isTabRoot(route.path))
const showsBottomNavigation = computed(() => !focusedShell.value)
</script>

<template>
  <div class="dashboard-shell" :class="{ 'focused-shell': !showsBottomNavigation }">
    <AppAlert />
    <AppRestTimerBanner />
    <main>
      <AppNavTop v-if="showsTopNavigation" />
      <RouterView />
    </main>
    <AppNavBottom v-if="showsBottomNavigation" />
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.dashboard-shell {
  padding-bottom: calc(5.25rem + env(safe-area-inset-bottom));
}
/* No tab bar to clear in the focused shell; the workout view reserves its own
   space for the session dock. */
.dashboard-shell.focused-shell {
  padding-bottom: 0;
}
main {
  @apply mx-auto w-full max-w-3xl px-3 py-5 sm:px-5 lg:px-8 lg:py-7;
}
</style>
