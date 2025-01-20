<script setup lang="ts">
import { useAuthStore } from '@/stores/auth.ts'
import { useRoute, useRouter } from 'vue-router'
import { computed, onMounted, ref, watch } from 'vue'
import AppButton from '@/ui/components/AppButton.vue'
import { type Set, type User } from '@/proto/api/v1/shared_pb.ts'
import { followUser, getUser, listSets, listWorkouts, unfollowUser } from '@/http/requests.ts'
import { usePageTitleStore } from '@/stores/pageTitle.ts'
import WorkoutChart from '@/ui/components/WorkoutChart.vue'
import AppCard from '@/ui/components/AppCard.vue'
import type { Workout } from '@/proto/api/v1/workout_service_pb.ts'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const pageTitleStore = usePageTitleStore()

const user = ref({} as User)
const workouts = ref([] as Workout[])
const pageToken = ref(new Uint8Array(0))

const tabs = computed(() => [
  { href: `/users/${user.value.id}`, name: 'Workouts' },
  { href: `/users/${user.value.id}/personal-bests`, name: 'Personal Bests' },
  { href: `/users/${user.value.id}/follows`, name: 'Follows' },
  { href: `/users/${user.value.id}/followers`, name: 'Followers' },
])

const activeTab = computed(() => route.fullPath)
const pageTitle = computed(() => {
  if (user.value.id === authStore.userId) return 'Me'
  return `${user.value.firstName} ${user.value.lastName}`
})

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
  await fetchWorkouts()
})

const fetchWorkouts = async () => {
  const res = await listWorkouts([user.value.id], pageToken.value)
  if (!res) return

  workouts.value = [...workouts.value, ...res.workouts]
  pageToken.value = res.pagination?.nextPageToken || new Uint8Array(0)
  if (pageToken.value.length > 0) {
    await fetchWorkouts()
  }
}

const fetchUser = async () => {
  const res = await getUser(route.params.id as string)
  if (!res) return

  user.value = res.user as User
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

const notMe = computed(() => user.value.id !== authStore.userId)
const followed = computed(() => user.value.followed)
</script>

<template>
  <div v-if="workouts.length">
    <h6>Trend</h6>
    <AppCard class="p-2">
      <WorkoutChart :workouts="workouts" />
    </AppCard>
  </div>

  <div v-if="notMe" class="mb-4">
    <AppButton v-if="followed" colour="gray" type="button" @click="onUnfollowUser">
      Unfollow {{ user.firstName }}
    </AppButton>
    <AppButton v-else colour="primary" type="button" @click="onFollowUser">
      Follow {{ user.firstName }}
    </AppButton>
  </div>

  <div class="mb-4">
    <select
      id="tabs"
      name="tabs"
      class="block w-full border-gray-200 rounded-md py-4 px-4 font-medium"
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
