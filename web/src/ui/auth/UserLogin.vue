<script setup lang="ts">
import { ref } from 'vue'
import router from '@/router/router'
import { login } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'
import { RouterLink } from 'vue-router'
import AppButton from '@/ui/components/AppButton.vue'
import { useNotificationStore } from '@/stores/notifications.ts'
import AuthPasswordInput from '@/ui/auth/AuthPasswordInput.vue'

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
      <p class="auth-eyebrow">Welcome back</p>
      <h1>Log in to GetStronger</h1>
      <p>Pick up your training exactly where you left off.</p>
    </header>

    <form class="auth-form" method="POST" @submit.prevent="onLogin">
      <div>
        <label for="email" class="auth-label">Email address</label>
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
          <label for="password" class="auth-label">Password</label>
          <RouterLink to="/forgot-password" class="auth-link text-sm">
            Forgot password?
          </RouterLink>
        </div>
        <div class="mt-2">
          <AuthPasswordInput id="password" v-model="password" name="password" />
        </div>
      </div>

      <AppButton type="submit" colour="primary" class="auth-submit">Log in</AppButton>
    </form>

    <p class="auth-footer">
      New to GetStronger?
      <RouterLink to="/signup" class="auth-link">Create an account</RouterLink>
    </p>
  </section>
</template>
