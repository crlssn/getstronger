<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import UserDashboard from '@/components/UserDashboard.vue'

const authStore = useAuthStore()
</script>

<template>
  <UserDashboard v-if="authStore.accessToken" />
  <RouterView v-else />
</template>
