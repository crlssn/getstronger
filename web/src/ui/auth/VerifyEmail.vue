<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { verifyEmail } from '@/http/requests'
import { useRoute, useRouter } from 'vue-router'
import { useAlertStore } from '@/stores/alerts.ts'
import { useEmailVerificationStore } from '@/stores/emailVerification.ts'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const alertStore = useAlertStore()
const emailVerificationStore = useEmailVerificationStore()

onMounted(async () => {
  const res = await verifyEmail(route.query.token as string)
  if (!res) return
  // Nothing is pending any more, so the recovery page no longer has an address
  // to offer.
  emailVerificationStore.clear()
  alertStore.setSuccess(t('auth.verification.verified'))
  await router.push('/login')
})
</script>

<template>
  <p class="text-pretty text-lg font-medium text-gray-500">{{ t('auth.verification.failed') }}</p>
</template>

<style scoped></style>
