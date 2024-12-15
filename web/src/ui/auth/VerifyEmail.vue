<script setup lang="ts">
import { onMounted } from 'vue'
import { verifyEmail } from '@/http/requests'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

onMounted(async () => {
  const res = await verifyEmail(route.query.token as string)
  if (!res) return
  await router.push('/login?verified')
})
</script>

<template>
  <p class="text-pretty text-lg font-medium text-gray-500">
    Sorry, we couldn't verify your email.
  </p>
</template>

<style scoped></style>
