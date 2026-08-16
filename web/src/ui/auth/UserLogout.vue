<script setup lang="ts">
import { onMounted } from 'vue'
import { logout } from '@/http/requests.ts'
import { useAuthStore } from '@/stores/auth.ts'
import { useNotificationStore } from '@/stores/notifications.ts'
import { usePreferencesStore } from '@/stores/preferences.ts'
import router from '@/router/router.ts'

onMounted(async () => {
  await logout()
  const authStore = useAuthStore()
  authStore.logout()
  usePreferencesStore().reset()

  const notificationStore = useNotificationStore()
  notificationStore.stopUnreadNotifications()

  await router.push('/login')
})
</script>

<template></template>

<style scoped></style>
