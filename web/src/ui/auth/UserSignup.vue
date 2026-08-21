<script setup lang="ts">
import { ref } from 'vue'
import { brandSignupSubtitle } from '@/brand'
import { signup } from '@/http/requests'
import { RouterLink, useRouter } from 'vue-router'
import AppButton from '@/ui/components/AppButton.vue'
import { type SignupRequest } from '@/proto/api/v1/auth_service_pb.ts'
import { useEmailVerificationStore } from '@/stores/emailVerification.ts'
import AuthPasswordInput from '@/ui/auth/AuthPasswordInput.vue'
import posthog from '@/posthog'

const router = useRouter()
const emailVerificationStore = useEmailVerificationStore()
const req = ref<SignupRequest>({
  $typeName: 'api.v1.SignupRequest',
  email: '',
  name: '',
  username: '',
  password: '',
  passwordConfirmation: '',
})

const onSignup = async () => {
  const res = await signup(req.value)
  if (!res) return
  posthog.capture('account_signed_up')
  // Signup sends the first verification email, so the resend cooldown starts
  // here rather than on the pending page.
  emailVerificationStore.markSent(req.value.email)
  await router.push({ name: 'verify-email-pending' })
}
</script>

<template>
  <section class="auth-view">
    <header class="auth-intro">
      <p class="auth-eyebrow">{{ $t('auth.startTraining') }}</p>
      <h1>{{ $t('auth.signupTitle') }}</h1>
      <p>{{ brandSignupSubtitle }}</p>
    </header>

    <form class="auth-form" method="POST" @submit.prevent="onSignup">
      <div>
        <label for="name" class="auth-label">{{ $t('auth.name') }}</label>
        <div class="mt-2">
          <input
            id="name"
            v-model="req.name"
            name="name"
            type="text"
            autocomplete="name"
            class="auth-input"
            required
          />
        </div>
      </div>

      <div>
        <label for="username" class="auth-label">{{ $t('auth.username') }}</label>
        <p class="mt-1 text-sm text-text-subtle">{{ $t('auth.usernameHelp') }}</p>
        <div class="mt-2">
          <input
            id="username"
            v-model="req.username"
            name="username"
            type="text"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            class="auth-input"
            minlength="3"
            maxlength="30"
            pattern="[A-Za-z0-9._]+"
            required
            @input="req.username = req.username.toLowerCase()"
          />
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

<style scoped>
@reference '../../assets/base.css';

/* The radio fills its label invisibly, so the control itself is the 44px tap
   target rather than a 1px screen-reader stub. */
.segmented > label {
  @apply relative;
}
.segmented-radio {
  @apply absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-control border-0 bg-transparent focus-visible:ring-2 focus-visible:ring-ink-muted;
  /* The forms plugin paints radios a checked dot via background-image; this
     input is a hit area, not an indicator. */
  background-image: none !important;
}
</style>
