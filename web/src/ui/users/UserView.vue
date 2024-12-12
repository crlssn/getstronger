<script setup lang="ts">
import { useAuthStore } from '@/stores/auth.ts'
import { useRoute, useRouter } from 'vue-router'
import { computed, onMounted, ref, watch } from 'vue'
import AppButton from '@/ui/components/AppButton.vue'
import { type User } from '@/proto/api/v1/shared_pb.ts'
import { followUser, getUser, unfollowUser } from '@/http/requests.ts'
import { usePageTitleStore } from '@/stores/pageTitle.ts'

const user = ref({} as User)
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const pageTitleStore = usePageTitleStore()

const tabs = computed(() => [
  { href: `/users/${user.value.id}`, name: 'Workouts' },
  { href: `/users/${user.value.id}/personal-bests`, name: 'Personal Bests' },
  { href: `/users/${user.value.id}/follows`, name: 'Follows' },
  { href: `/users/${user.value.id}/followers`, name: 'Followers' },
])

const activeTab = computed(() => route.fullPath)
const pageTitle = computed(() => `${user.value.firstName} ${user.value.lastName}`)

watch(
  () => route.params.id,
  async () => {
    await fetchUser()
    pageTitleStore.setPageTitle(pageTitle.value)
  },
)

onMounted(async () => {
  await fetchUser()
  pageTitleStore.setPageTitle(pageTitle.value)
})

const fetchUser = async () => {
  const res = await getUser(route.params.id as string)
  if (!res) return

  user.value = res.user
}

const onFollowUser = async () => {
  await followUser(user.value.id)
  await fetchUser()
}

const onUnfollowUser = async () => {
  await unfollowUser(user.value.id)
  await fetchUser()
}

const updateTab = (event: Event) => {
  const target = event.target as HTMLSelectElement
  router.push(target.value)
}
</script>

<template>
  <div v-if="user.id !== authStore.userID">
    <AppButton
      v-if="user.followed"
      colour="gray"
      type="button"
      container-class="px-4 pb-4"
      @click="onUnfollowUser"
    >
      Unfollow {{ user.firstName }}
    </AppButton>
    <AppButton
      v-else
      colour="primary"
      type="button"
      container-class="px-4 pb-4"
      @click="onFollowUser"
    >
      Follow {{ user.firstName }}
    </AppButton>
  </div>

  <div class="mb-4">
    <select
      id="tabs"
      name="tabs"
      class="block w-full border-gray-300 focus:ring-0 py-4 px-4 font-medium"
      @change="updateTab"
    >
      <option
        v-for="tab in tabs"
        :key="tab.name"
        :value="tab.href"
        :selected="tab.href === activeTab"
      >
        {{ tab.name }}
      </option>
    </select>
  </div>

  <router-view :page-title="pageTitle" />
</template>

<style scoped></style>
