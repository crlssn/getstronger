<script setup lang="ts">
import { onMounted } from 'vue'
import { verifyEmail } from '@/http/requests'
import { useRoute, useRouter } from 'vue-router'
import { useAlertStore } from '@/stores/alerts.ts'

const route = useRoute()
const router = useRouter()
const alertStore = useAlertStore()

onMounted(async () => {
  const res = await verifyEmail(route.query.token as string)
  if (!res) return
  alertStore.setSuccess('Thank you for verifying your email')
  await router.push('/login')
})
</script>

<template>
  <p class="text-pretty text-lg font-medium text-gray-500">Sorry, we couldn't verify your email.</p>
</template>

<style scoped></style>
