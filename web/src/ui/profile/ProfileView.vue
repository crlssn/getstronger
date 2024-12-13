<script setup lang="ts">
import AppButton from '@/ui/components/AppButton.vue'
import { onMounted, ref } from 'vue'
import { getUser } from '@/http/requests.ts'
import { useAuthStore } from '@/stores/auth.ts'
import type { User } from '@/proto/api/v1/shared_pb.ts'
import { UserCircleIcon } from '@heroicons/vue/24/solid'

const user = ref<User>()

onMounted(async () => {
  await fetchUser()
})

const fetchUser = async () => {
  const res = await getUser(useAuthStore().userId)
  if (!res) return

  user.value = res.user
}
</script>

<template>
  <div class="container">
    <UserCircleIcon class="size-48 mx-auto text-gray-900" />
    <h1>{{ user?.firstName }} {{ user?.lastName }}</h1>
    <p>{{ user?.email }}</p>
  </div>
  <AppButton type="link" to="/logout" colour="red" container-class="px-4 pb-4"> Logout </AppButton>
</template>

<style scoped>
.container {
  @apply text-center mb-4;
}

h1 {
  @apply text-xl font-medium;
}
</style>
