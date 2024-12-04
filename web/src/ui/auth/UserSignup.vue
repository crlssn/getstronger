<script setup lang="ts">
import { ref } from 'vue'
import { create } from '@bufbuild/protobuf'
import { AuthClient } from '@/http/clients'
import { ConnectError } from '@connectrpc/connect'
import { RouterLink, useRouter } from 'vue-router'
import AppButton from '@/ui/components/AppButton.vue'
import { SignupRequestSchema } from '@/proto/api/v1/auth_pb'

const firstName = ref('')
const lastName = ref('')
const email = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const requestError = ref('')

const router = useRouter()

const signup = async () => {
  const request = create(SignupRequestSchema, {
    email: email.value,
    firstName: firstName.value,
    lastName: lastName.value,
    password: password.value,
    passwordConfirmation: passwordConfirmation.value,
  })

  try {
    requestError.value = ''
    await AuthClient.signup(request)
    await router.push('/login?success')
  } catch (error) {
    console.error('signup failed:', error)
    if (error instanceof ConnectError) {
      requestError.value = error.message
      return
    }
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
      >
      <h2 class="mt-10 text-center text-2xl/9 font-bold tracking-tight text-gray-900">
        Sign up
      </h2>
    </div>

    <div class="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
      <div
        v-if="requestError"
        class="bg-red-200 rounded-md py-3 px-5 mb-2 text-sm/6 text-red-800"
        role="alert"
      >
        {{ requestError }}
      </div>
      <form
        class="space-y-6"
        method="POST"
        @submit.prevent="signup"
      >
        <div>
          <label
            for="email"
            class="block text-sm/6 font-medium text-gray-900"
          >First name</label>
          <div class="mt-2">
            <input
              id="firstname"
              v-model="firstName"
              name="firstname"
              type="text"
              required
              class="block w-full rounded-md border-0 bg-white/5 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm"
            >
          </div>
        </div>

        <div>
          <label
            for="email"
            class="block text-sm/6 font-medium text-gray-900"
          >Last name</label>
          <div class="mt-2">
            <input
              v-model="lastName"
              name="lastname"
              type="text"
              required
            >
          </div>
        </div>

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
          <div class="flex items-center justify-between">
            <label
              for="password"
              class="block text-sm/6 font-medium text-gray-900"
            >
              Confirm Password
            </label>
          </div>
          <div class="mt-2">
            <input
              id="passwordConfirmation"
              v-model="passwordConfirmation"
              name="passwordConfirmation"
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
            Sign up
          </AppButton>
        </div>
      </form>

      <p class="mt-10 text-center text-sm/6 text-gray-400">
        Already a member?
        <RouterLink
          to="/login"
          class="font-semibold text-indigo-600 hover:text-indigo-500"
        >
          Login
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
