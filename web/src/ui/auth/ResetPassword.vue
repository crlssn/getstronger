<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { updatePassword } from '@/http/requests'
import AppButton from '@/ui/components/AppButton.vue'
import { type UpdatePasswordRequest } from '@/proto/api/v1/auth_service_pb'

const route = useRoute()
const router = useRouter()

const req = ref<UpdatePasswordRequest>({
  $typeName: 'api.v1.UpdatePasswordRequest',
  password: '',
  passwordConfirmation: '',
  token: route.query.token as string,
})

const onSignup = async () => {
  const res = await updatePassword(req.value)
  if (!res) return
  await router.push('/login?reset')
}
</script>

<template>
  <div class="flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
    <div class="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
      <form class="space-y-6" method="POST" @submit.prevent="onSignup">
        <div>
          <div class="flex items-center justify-between">
            <label for="password" class="block text-sm/6 font-medium text-gray-900">Password</label>
          </div>
          <div class="mt-2">
            <input
              id="password"
              v-model="req.password"
              name="password"
              type="password"
              autocomplete="current-password"
              required
            />
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between">
            <label for="password" class="block text-sm/6 font-medium text-gray-900">
              Confirm Password
            </label>
          </div>
          <div class="mt-2">
            <input
              id="passwordConfirmation"
              v-model="req.passwordConfirmation"
              name="passwordConfirmation"
              type="password"
              autocomplete="current-password"
              required
            />
          </div>
        </div>

        <div>
          <AppButton type="submit" colour="primary"> Update Password </AppButton>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
input {
  @apply block w-full rounded-md border-0 bg-white py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm;
}
</style>
