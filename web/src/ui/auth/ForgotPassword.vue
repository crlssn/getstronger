<script setup lang="ts">
import { ref } from 'vue'
import { resetRequest } from '@/utils/request'
import { resetPassword } from '@/http/requests'
import AppButton from '@/ui/components/AppButton.vue'
import { RouterLink } from 'vue-router'
import { type ResetPasswordRequest } from '@/proto/api/v1/auth_service_pb'
import { useAlertStore } from '@/stores/alerts.ts'

const alertStore = useAlertStore()

const req = ref<ResetPasswordRequest>({
  $typeName: 'api.v1.ResetPasswordRequest',
  email: '',
})

const onSubmit = async () => {
  const res = await resetPassword(req.value)
  if (!res) return
  resetRequest(req)
  alertStore.setSuccessWithoutPageRefresh('Please check your inbox to reset your password')
}
</script>

<template>
  <form class="space-y-6" method="POST" @submit.prevent="onSubmit">
    <div>
      <label for="email" class="block font-medium text-gray-900">Email address</label>
      <div class="mt-2">
        <input
          id="email"
          v-model="req.email"
          name="email"
          type="email"
          autocomplete="email"
          required
        />
      </div>
    </div>
    <div>
      <AppButton type="submit" colour="primary">Reset Password</AppButton>
    </div>
  </form>

  <p class="mt-6 text-center text-gray-400">
    Remember your password?
    <RouterLink to="/login" class="font-semibold text-indigo-600 hover:text-indigo-500">
      Login
    </RouterLink>
  </p>
</template>

<style scoped>
input {
  @apply block w-full rounded-md border-0 bg-white py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600;
}
</style>
