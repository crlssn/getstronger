<script setup lang="ts">
import { ref } from 'vue'
import { signup } from '@/http/requests'
import { RouterLink, useRouter } from 'vue-router'
import AppButton from '@/ui/components/AppButton.vue'
import { type SignupRequest } from '@/proto/api/v1/auth_service_pb.ts'
import { useAlertStore } from '@/stores/alerts.ts'
import AuthPasswordInput from '@/ui/auth/AuthPasswordInput.vue'

const router = useRouter()
const alertStore = useAlertStore()
const req = ref<SignupRequest>({
  $typeName: 'api.v1.SignupRequest',
  email: '',
  firstName: '',
  lastName: '',
  password: '',
  passwordConfirmation: '',
})

const onSignup = async () => {
  const res = await signup(req.value)
  if (!res) return
  alertStore.setSuccess('Please check your inbox to verify your email')
  await router.push('/login')
}
</script>

<template>
  <section class="auth-view">
    <header class="auth-intro">
      <p class="auth-eyebrow">{{ $t('auth.startTraining') }}</p>
      <h1>{{ $t('auth.signupTitle') }}</h1>
      <p>{{ $t('auth.signupSubtitle') }}</p>
    </header>

    <form class="auth-form" method="POST" @submit.prevent="onSignup">
      <div class="grid gap-5 sm:grid-cols-2">
        <div>
          <label for="firstname" class="auth-label">{{ $t('auth.firstName') }}</label>
          <div class="mt-2">
            <input
              id="firstname"
              v-model="req.firstName"
              name="firstname"
              type="text"
              autocomplete="given-name"
              class="auth-input"
              required
            />
          </div>
        </div>

        <div>
          <label for="lastname" class="auth-label">{{ $t('auth.lastName') }}</label>
          <div class="mt-2">
            <input
              id="lastname"
              v-model="req.lastName"
              name="lastname"
              type="text"
              autocomplete="family-name"
              class="auth-input"
              required
            />
          </div>
        </div>
      </div>

      <div>
        <label for="email" class="auth-label">{{ $t('auth.email') }}</label>
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

      <div>
        <label for="password" class="auth-label">{{ $t('auth.password') }}</label>
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
        <label for="passwordConfirmation" class="auth-label">{{
          $t('auth.confirmPassword')
        }}</label>
        <div class="mt-2">
          <AuthPasswordInput
            id="passwordConfirmation"
            v-model="req.passwordConfirmation"
            name="passwordConfirmation"
            autocomplete="new-password"
          />
        </div>
      </div>

      <AppButton type="submit" colour="primary" class="auth-submit">{{
        $t('auth.createAccount')
      }}</AppButton>
    </form>

    <p class="auth-footer">
      {{ $t('auth.alreadyMember') }}
      <RouterLink to="/login" class="auth-link">{{ $t('auth.login') }}</RouterLink>
    </p>
  </section>
</template>
