<script setup lang="ts">
import { ref } from 'vue'
import router from '@/router/router'
import { login } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'
import { RouterLink } from 'vue-router'
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
  notificationStore.streamUnreadNotifications()
  await router.push('/home')
}
</script>

<template>
  <form class="space-y-6" method="POST" @submit.prevent="onLogin">
    <div>
      <label for="email" class="block /6 font-medium text-gray-900">Email address</label>
      <div class="mt-2">
        <input id="email" v-model="email" name="email" type="email" autocomplete="email" required />
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
      <AppButton type="submit" colour="primary">Login</AppButton>
    </div>
  </form>

  <p class="mt-6 text-center text-gray-400">
    Not a member?
    <RouterLink to="signup" class="font-semibold text-indigo-600 hover:text-indigo-500">
      Sign up
    </RouterLink>
  </p>
</template>

<style scoped>
input {
  @apply block w-full rounded-md border-0 bg-white py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600;
}
</style>
