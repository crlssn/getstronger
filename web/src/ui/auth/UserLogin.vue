<script setup lang="ts">
import { ref } from 'vue'
import router from '@/router/router'
import { login } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'
import { scheduleTokenRefresh } from '@/jwt/jwt'
import { RouterLink, useRoute } from 'vue-router'
import AppButton from '@/ui/components/AppButton.vue'
import { useNotificationStore } from '@/stores/notifications.ts'
import AppAlert from '@/ui/components/AppAlert.vue'

const email = ref('')
const password = ref('')

const authStore = useAuthStore()
const notificationStore = useNotificationStore()

const onLogin = async () => {
  const res = await login(email.value, password.value)
  if (!res) return
  authStore.setAccessToken(res.accessToken)
  authStore.setAccessTokenRefreshInterval(scheduleTokenRefresh())
  notificationStore.streamUnreadNotifications()
  await router.push('/home')
}
</script>

<template>
  <div class="flex min-h-full flex-col justify-center px-6 py-12">
    <AppAlert v-if="useRoute().query.success === null" type="success" message="Please check your inbox to verify your email" />
    <AppAlert v-if="useRoute().query.verified === null" type="success" message="Thank you for verifying your email" />
    <AppAlert v-if="useRoute().query.reset === null" type="success" message="Your password has been reset" />
    <form class="space-y-6" method="POST" @submit.prevent="onLogin">
      <div>
        <label for="email" class="block /6 font-medium text-gray-900">Email address</label>
        <div class="mt-2">
          <input
            id="email"
            v-model="email"
            name="email"
            type="email"
            autocomplete="email"
            required
          />
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between">
          <label for="password" class="block font-medium text-gray-900">Password</label>
          <div class="">
            <RouterLink
              to="/forgot-password"
              class="font-semibold text-indigo-600 hover:text-indigo-500"
            >
              Forgot password?
            </RouterLink>
          </div>
        </div>
        <div class="mt-2">
          <input
            id="password"
            v-model="password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
          />
        </div>
      </div>

      <div>
        <AppButton type="submit" colour="primary"> Login</AppButton>
      </div>
    </form>

    <p class="mt-6 text-center text-gray-400">
      Not a member?
      <RouterLink to="signup" class="font-semibold text-indigo-600 hover:text-indigo-500">
        Sign up
      </RouterLink>
    </p>
  </div>
</template>

<style scoped>
input {
  @apply block w-full rounded-md border-0 bg-white py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600;
}
</style>
