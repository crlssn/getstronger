<script setup lang="ts">
import { ref } from 'vue'
import router from '@/router/router'
import { login } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'
import { ScheduleTokenRefresh } from '@/jwt/jwt'
import { RouterLink, useRoute } from 'vue-router'
import AppButton from '@/ui/components/AppButton.vue'
import { useNotificationStore } from '@/stores/notifications.ts'

const email = ref('')
const password = ref('')

const authStore = useAuthStore()
const notificationStore = useNotificationStore()

const onLogin = async () => {
  const res = await login(email.value, password.value)
  if (!res) return
  authStore.setAccessToken(res.accessToken)
  authStore.setAccessTokenRefreshInterval(ScheduleTokenRefresh())
  notificationStore.streamUnreadNotifications()
  await router.push('/home')
}
</script>

<template>
  <div class="flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-sm">
      <img
        class="mx-auto h-10 w-auto"
        src="https://tailwindui.com/plus/img/logos/mark.svg?color=indigo&shade=500"
        alt="Your Company"
      >
      <h2 class="mt-10 text-center text-2xl/9 font-bold tracking-tight text-gray-900">
        Sign in to your account
      </h2>
    </div>

    <div class="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
      <div
        v-if="useRoute().query.success === null"
        class="bg-green-200 rounded-md py-3 px-5 mb-2 text-sm/6 text-green-800"
        role="alert"
      >
        You have successfully signed up. Please login.
      </div>
      <form
        class="space-y-6"
        method="POST"
        @submit.prevent="onLogin"
      >
        <div>
          <label
            for="email"
            class="block text-sm/6 font-medium text-gray-900"
          >Email address</label>
          <div class="mt-2">
            <input
              id="email"
              v-model="email"
              name="email"
              type="email"
              autocomplete="email"
              required
            >
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between">
            <label
              for="password"
              class="block text-sm/6 font-medium text-gray-900"
            >Password</label>
            <div class="text-sm">
              <a
                href="#"
                class="font-semibold text-indigo-600 hover:text-indigo-500"
              >
                Forgot password?
              </a>
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
            >
          </div>
        </div>

        <div>
          <AppButton
            type="submit"
            colour="primary"
          >
            Login
          </AppButton>
        </div>
      </form>

      <p class="mt-10 text-center text-sm/6 text-gray-400">
        Not a member?
        <RouterLink
          to="signup"
          class="font-semibold text-indigo-600 hover:text-indigo-500"
        >
          Sign up
        </RouterLink>
      </p>
    </div>
  </div>
</template>

<style scoped>
input {
  @apply block w-full rounded-md border-0 bg-white py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm;
}
</style>
