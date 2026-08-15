<script setup lang="ts">
import { resetPassword } from '@/http/requests'
import { type ResetPasswordRequest } from '@/proto/api/v1/auth_service_pb'
import { useAlertStore } from '@/stores/alerts.ts'
import { resetRequest } from '@/utils/request'
import AppButton from '@/ui/components/AppButton.vue'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'

const alertStore = useAlertStore()

const req = ref<ResetPasswordRequest>({
  $typeName: 'api.v1.ResetPasswordRequest',
  email: '',
})

const onSubmit = async () => {
  const res = await resetPassword(req.value)
  if (!res) return
  resetRequest(req)
  alertStore.setSuccessWithoutPageRefresh('Please check your inbox to reset your password')
}
</script>

<template>
  <section class="auth-view">
    <header class="auth-intro">
      <p class="auth-eyebrow">Account recovery</p>
      <h1>Reset your password</h1>
      <p>Enter your email and we’ll send you a secure reset link.</p>
    </header>

    <form class="auth-form" method="POST" @submit.prevent="onSubmit">
      <div>
        <label for="email" class="auth-label">Email address</label>
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
      <AppButton type="submit" colour="primary" class="auth-submit">Send reset link</AppButton>
    </form>

    <p class="auth-footer">
      Remember your password?
      <RouterLink to="/login" class="auth-link">Log in</RouterLink>
    </p>
  </section>
</template>
