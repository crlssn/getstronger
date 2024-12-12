<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import UserDashboard from '@/ui/components/UserDashboard.vue'

const authStore = useAuthStore()
</script>

<template>
  asdasd
  <UserDashboard v-if="authStore.accessToken" />
  <RouterView v-else />
</template>
