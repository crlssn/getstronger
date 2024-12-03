<script setup lang="ts">
import { useAuthStore } from '@/stores/auth.ts'
import UserProfile from '@/ui/components/UserProfile.vue'

const authStore = useAuthStore()
</script>

<template>
  <UserProfile :user-id="authStore.userID" />
</template>

<style scoped></style>
