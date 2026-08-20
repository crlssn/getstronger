<script setup lang="ts">
import { resetPassword } from '@/http/requests'
import { type ResetPasswordRequest } from '@/proto/api/v1/auth_service_pb'
import { useAlertStore } from '@/stores/alerts.ts'
import { resetRequest } from '@/utils/request'
import AppButton from '@/ui/components/AppButton.vue'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import posthog from '@/posthog'

const { t } = useI18n()
const alertStore = useAlertStore()

const req = ref<ResetPasswordRequest>({
  $typeName: 'api.v1.ResetPasswordRequest',
  email: '',
})

const onSubmit = async () => {
  const res = await resetPassword(req.value)
  if (!res) return
  posthog.capture('password_reset_requested')
  resetRequest(req)
  alertStore.setSuccessWithoutPageRefresh(t('auth.recovery.linkSent'))
}
</script>

<template>
  <section class="auth-view">
    <header class="auth-intro">
      <p class="auth-eyebrow">{{ t('auth.recovery.eyebrow') }}</p>
      <h1>{{ t('auth.recovery.title') }}</h1>
      <p>{{ t('auth.recovery.intro') }}</p>
    </header>

    <form class="auth-form" method="POST" @submit.prevent="onSubmit">
      <div>
        <label for="email" class="auth-label">{{ t('auth.email') }}</label>
        <div class="mt-2">
          <input
            id="email"
            v-model="req.email"
            name="email"
            type="email"
            autocomplete="email"
            class="auth-input"
            inputmode="email"
            required
          />
        </div>
      </div>
      <AppButton type="submit" colour="primary" class="auth-submit">{{
        t('auth.sendResetLink')
      }}</AppButton>
    </form>

    <p class="auth-footer">
      {{ t('auth.recovery.rememberPassword') }}
      <RouterLink to="/login" class="auth-link">{{ t('auth.login') }}</RouterLink>
    </p>
  </section>
</template>
