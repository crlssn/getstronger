<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppDashboard from '@/ui/components/AppDashboard.vue'

const authStore = useAuthStore()
</script>

<template>
  <AppDashboard v-if="authStore.authorised()" />
  <RouterView v-else />
</template>
