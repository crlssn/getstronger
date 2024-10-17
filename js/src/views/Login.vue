<script setup lang="ts">
import {LoginRequest} from "@/pb/api/v1/auth_pb";
import {Auth} from "@/clients/clients";
import {ref} from 'vue'
import {RouterLink} from 'vue-router'
import {ConnectError} from "@connectrpc/connect";
import {useAuthStore} from "@/stores/auth";
import router from "@/router/router";
import {ScheduleTokenRefresh} from "@/jwt/jwt";

const email = ref('')
const password = ref('')
const resError = ref(null);
const authStore = useAuthStore()

const login = async () => {
  const request = new LoginRequest()
  request.email = email.value
  request.password = password.value

  try {
    const response = await Auth.login(request);
    authStore.setAccessToken(response.accessToken);
    authStore.setAccessTokenRefreshInterval(ScheduleTokenRefresh())
    await router.push('/home')
  } catch (error) {
    if (error instanceof ConnectError) {
      resError.value = error.message;
      return
    }
    console.error('login failed:', error);
  }
}
</script>

<template>
  <div class="flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-sm">
      <img class="mx-auto h-10 w-auto" src="https://tailwindui.com/plus/img/logos/mark.svg?color=indigo&shade=500"
           alt="Your Company">
      <h2 class="mt-10 text-center text-2xl/9 font-bold tracking-tight text-gray-900">Sign in to your account</h2>
    </div>

    <div class="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
      <div v-if="resError" class="bg-red-200 rounded-md py-3 px-5 mb-2 text-sm/6 text-red-800" role="alert">{{
          resError
        }}
      </div>
      <form class="space-y-6" method="POST" @submit.prevent="login">
        <div>
          <label for="email" class="block text-sm/6 font-medium text-gray-900">Email address</label>
          <div class="mt-2">
            <input v-model="email" id="email" name="email" type="email" autocomplete="email" required
                   class="block w-full rounded-md border-0 bg-white/5 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6">
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between">
            <label for="password" class="block text-sm/6 font-medium text-gray-900">Password</label>
            <div class="text-sm">
              <a href="#" class="font-semibold text-indigo-600 hover:text-indigo-500">Forgot password?</a>
            </div>
          </div>
          <div class="mt-2">
            <input v-model="password" id="password" name="password" type="password" autocomplete="current-password"
                   required
                   class="block w-full rounded-md border-0 bg-white/5 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6">
          </div>
        </div>

        <div>
          <button type="submit"
                  class="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
            Sign in
          </button>
        </div>
      </form>

      <p class="mt-10 text-center text-sm/6 text-gray-400">
        Not a member?
        <RouterLink to="signup" class="font-semibold text-indigo-600 hover:text-indigo-500">Sign up</RouterLink>
      </p>
    </div>
  </div>
</template>
