<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppDashboard from '@/ui/components/AppDashboard.vue'

const authStore = useAuthStore()
</script>

<template>
  <AppDashboard v-if="authStore.authorised" />
  <main v-else>
    <RouterView />
  </main>
</template>

<style scoped>
main {
  @apply flex min-h-full flex-col justify-center px-4 max-w-4xl mx-auto;
}
</style>
