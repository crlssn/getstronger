<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import UserDashboard from '@/ui/components/UserDashboard.vue'
import { RouterView } from 'vue-router'

const authStore = useAuthStore()
</script>

<template>
  <UserDashboard v-if="authStore.accessToken" />
  <RouterView v-else />
</template>
