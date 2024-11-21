<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Dashboard from '@/components/UserDashboard.vue'

const authStore = useAuthStore()
</script>

<template>
  <Dashboard v-if="authStore.accessToken" />
  <RouterView v-else />
</template>
