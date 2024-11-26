<script setup lang="ts">
import { AuthClient } from '@/clients/clients'
import { ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ConnectError } from '@connectrpc/connect'
import { useAuthStore } from '@/stores/auth'
import router from '@/router/router'
import { ScheduleTokenRefresh } from '@/jwt/jwt'
import AppButton from '@/ui/components/AppButton.vue'
import { create } from '@bufbuild/protobuf'
import { LoginRequestSchema } from '@/proto/api/v1/auth_pb.ts'

const email = ref('')
const password = ref('')
const resError = ref('')
const authStore = useAuthStore()

const login = async () => {
  const request = create(LoginRequestSchema, {
    email: email.value,
    password: password.value,
  })

  try {
    const response = await AuthClient.login(request)
    authStore.setAccessToken(response.accessToken)
    authStore.setAccessTokenRefreshInterval(ScheduleTokenRefresh())
    await router.push('/home')
  } catch (error) {
    if (error instanceof ConnectError) {
      resError.value = error.message
      return
    }
    console.error('login failed:', error)
  }
}
</script>

<template>
  <div class="flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-sm">
      <img
        class="mx-auto h-10 w-auto"
        src="https://tailwindui.com/plus/img/logos/mark.svg?color=indigo&shade=500"
        alt="Your Company"
      />
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
      <div
        v-if="resError"
        class="bg-red-200 rounded-md py-3 px-5 mb-2 text-sm/6 text-red-800"
        role="alert"
      >
        {{ resError }}
      </div>
      <form class="space-y-6" method="POST" @submit.prevent="login">
        <div>
          <label for="email" class="block text-sm/6 font-medium text-gray-900">Email address</label>
          <div class="mt-2">
            <input
              v-model="email"
              id="email"
              name="email"
              type="email"
              autocomplete="email"
              required
            />
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between">
            <label for="password" class="block text-sm/6 font-medium text-gray-900">Password</label>
            <div class="text-sm">
              <a href="#" class="font-semibold text-indigo-600 hover:text-indigo-500">
                Forgot password?
              </a>
            </div>
          </div>
          <div class="mt-2">
            <input
              v-model="password"
              id="password"
              name="password"
              type="password"
              autocomplete="current-password"
              required
            />
          </div>
        </div>

        <div>
          <AppButton type="submit" colour="primary"> Login </AppButton>
        </div>
      </form>

      <p class="mt-10 text-center text-sm/6 text-gray-400">
        Not a member?
        <RouterLink to="signup" class="font-semibold text-indigo-600 hover:text-indigo-500">
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
