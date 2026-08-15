<script setup lang="ts">
import { ref } from 'vue'
import router from '@/router/router'
import { login } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'
import { RouterLink } from 'vue-router'
import AppButton from '@/ui/components/AppButton.vue'
import { useNotificationStore } from '@/stores/notifications.ts'
import AuthPasswordInput from '@/ui/auth/AuthPasswordInput.vue'
import { brandName } from '@/brand'

const email = ref('')
const password = ref('')

const authStore = useAuthStore()
const notificationStore = useNotificationStore()

const onLogin = async () => {
  const res = await login(email.value, password.value)
  if (!res) return
  authStore.setAccessToken(res.accessToken)
  notificationStore.streamUnreadNotifications()
  await router.push('/home')
}
</script>

<template>
  <section class="auth-view">
    <header class="auth-intro">
      <p class="auth-eyebrow">{{ $t('auth.welcomeBack') }}</p>
      <h1>{{ $t('auth.loginTitle', { brand: brandName }) }}</h1>
      <p>{{ $t('auth.loginSubtitle') }}</p>
    </header>

    <form class="auth-form" method="POST" @submit.prevent="onLogin">
      <div>
        <label for="email" class="auth-label">{{ $t('auth.email') }}</label>
        <div class="mt-2">
          <input
            id="email"
            v-model="email"
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
        <div class="flex items-center justify-between gap-4">
          <label for="password" class="auth-label">{{ $t('auth.password') }}</label>
          <RouterLink to="/forgot-password" class="auth-link text-sm">
            {{ $t('auth.forgotPassword') }}
          </RouterLink>
        </div>
        <div class="mt-2">
          <AuthPasswordInput id="password" v-model="password" name="password" />
        </div>
      </div>

      <AppButton type="submit" colour="primary" class="auth-submit">{{
        $t('auth.login')
      }}</AppButton>
    </form>

    <p class="auth-footer">
      {{ $t('auth.newMember', { brand: brandName }) }}
      <RouterLink to="/signup" class="auth-link">{{ $t('auth.createAccount') }}</RouterLink>
    </p>

    <!-- A permanent way back to the pending state, so that a dismissed notice
         or a reload never strands an unverified account. -->
    <p class="auth-footer">
      {{ $t('auth.verification.loginPrompt') }}
      <RouterLink :to="{ name: 'verify-email-pending' }" class="auth-link">{{
        $t('auth.verification.loginLink')
      }}</RouterLink>
    </p>
  </section>
</template>
