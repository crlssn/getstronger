<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import AppDashboard from '@/ui/components/AppDashboard.vue'
import AppUpdateBanner from '@/ui/components/AppUpdateBanner.vue'
import GuestView from '@/ui/components/GuestView.vue'

const authStore = useAuthStore()
</script>

<template>
  <div class="statusbar-scrim" aria-hidden="true"></div>
  <AppDashboard v-if="authStore.authorised" />
  <GuestView v-else />
  <AppUpdateBanner />
</template>

<style scoped>
/* Backdrop for the status bar and Dynamic Island in the native WebView, where
   viewport-fit=cover lets content scroll underneath them. The blur keeps the
   clock legible over any content, like a native navigation bar. Browsers
   report a zero inset, which collapses the element entirely. */
.statusbar-scrim {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 50;
  height: env(safe-area-inset-top);
  background: rgb(255 255 255 / 0.72);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
</style>
