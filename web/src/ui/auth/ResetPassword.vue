<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { updatePassword } from '@/http/requests'
import AppButton from '@/ui/components/AppButton.vue'
import AuthPasswordInput from '@/ui/auth/AuthPasswordInput.vue'
import { type UpdatePasswordRequest } from '@/proto/api/v1/auth_service_pb'
import { useAlertStore } from '@/stores/alerts.ts'

const route = useRoute()
const router = useRouter()
const alertStore = useAlertStore()

const req = ref<UpdatePasswordRequest>({
  $typeName: 'api.v1.UpdatePasswordRequest',
  password: '',
  passwordConfirmation: '',
  token: route.query.token as string,
})

const onSignup = async () => {
  const res = await updatePassword(req.value)
  if (!res) return
  alertStore.setSuccess('Your password has been reset')
  await router.push('/login')
}
</script>

<template>
  <section class="auth-view">
    <header class="auth-intro">
      <p class="auth-eyebrow">Secure your account</p>
      <h1>Choose a new password</h1>
      <p>Enter and confirm the password you’d like to use from now on.</p>
    </header>

    <form class="auth-form" method="POST" @submit.prevent="onSignup">
      <div>
        <label for="password" class="auth-label">New password</label>
        <div class="mt-2">
          <AuthPasswordInput
            id="password"
            v-model="req.password"
            name="password"
            autocomplete="new-password"
          />
        </div>
      </div>

      <div>
        <label for="passwordConfirmation" class="auth-label">Confirm new password</label>
        <div class="mt-2">
          <AuthPasswordInput
            id="passwordConfirmation"
            v-model="req.passwordConfirmation"
            name="passwordConfirmation"
            autocomplete="new-password"
          />
        </div>
      </div>

      <AppButton type="submit" colour="primary" class="auth-submit">Update password</AppButton>
    </form>
  </section>
</template>
