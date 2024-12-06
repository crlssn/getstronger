<script setup lang="ts">
import { onMounted } from 'vue'
import { verifyEmail } from '@/http/requests'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

onMounted(async () => {
  await verifyEmail(route.query.token as string)
  await router.push('/login?verified')
})
</script>

<template></template>

<style scoped></style>
