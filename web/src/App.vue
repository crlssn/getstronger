<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import AppDashboard from '@/ui/components/AppDashboard.vue'
import GuestView from '@/ui/components/GuestView.vue'

const authStore = useAuthStore()
</script>

<template>
  <AppDashboard v-if="authStore.authorised" />
  <GuestView v-else/>
</template>

<style scoped></style>
