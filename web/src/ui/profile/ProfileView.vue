<script setup lang="ts">
import router from '@/router/router'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { create } from '@bufbuild/protobuf'
import { useAuthStore } from '@/stores/auth.ts'
import AppList from '@/ui/components/AppList.vue'
import AppButton from '@/ui/components/AppButton.vue'
import { type User } from '@/proto/api/v1/shared_pb.ts'
import CardWorkout from '@/ui/components/CardWorkout.vue'
import { UserClient, WorkoutClient } from '@/clients/clients'
import AppListItemLink from '@/ui/components/AppListItemLink.vue'
import { ListWorkoutsRequestSchema, type Workout } from '@/proto/api/v1/workouts_pb'
import { ListFolloweesRequestSchema, ListFollowersRequestSchema } from '@/proto/api/v1/users_pb.ts'

const workouts = ref<Workout[]>()
const followers = ref<User[]>()
const followees = ref<User[]>()
const route = useRoute()
const authStore = useAuthStore()

onMounted(async () => {
  await fetchWorkouts()
  await fetchFollowers()
  await fetchFollowees()
})

const fetchWorkouts = async () => {
  const req = create(ListWorkoutsRequestSchema, {
    pageSize: 100,
    pageToken: new Uint8Array(0),
    userIds: [authStore.userID],
  })
  const res = await WorkoutClient.list(req)
  workouts.value = res.workouts
}

const fetchFollowers = async () => {
  const req = create(ListFollowersRequestSchema, {
    followerId: authStore.userID,
  })
  const res = await UserClient.listFollowers(req)
  followers.value = res.followers
}

const fetchFollowees = async () => {
  const req = create(ListFolloweesRequestSchema, {
    followeeId: authStore.userID,
  })
  const res = await UserClient.listFollowees(req)
  followees.value = res.followees
}

const tabs = [
  { href: '/profile', name: 'Workouts' },
  { href: '/profile?tab=personal-bests', name: 'Personal Bests' },
  { href: '/profile?tab=follows', name: 'Follows' },
  { href: '/profile?tab=followers', name: 'Followers' },
]

const updateTab = (event: Event) => {
  const target = event.target as HTMLSelectElement
  router.push(target.value)
}
</script>

<template>
  <div>
    <AppButton
      type="link"
      to="/logout"
      colour="red"
    >
      Logout
    </AppButton>
  </div>
  <div class="mb-4">
    <div class="sm:hidden">
      <select
        id="tabs"
        name="tabs"
        class="block w-full rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 py-4 px-5 font-medium text-sm"
        @change="updateTab"
      >
        <option
          v-for="tab in tabs"
          :key="tab.name"
          :value="tab.href"
          :selected="tab.href === route.fullPath"
        >
          {{ tab.name }}
        </option>
      </select>
    </div>
    <div class="hidden sm:block">
      <nav
        class="flex"
        aria-label="Tabs"
      >
        <RouterLink
          v-for="tab in tabs"
          :key="tab.name"
          :to="tab.href"
          :class="[
            tab.href === route.fullPath
              ? 'border-gray-200 text-gray-900 bg-white'
              : 'border-transparent text-gray-500 hover:text-gray-700',
            'w-1/4 border border-b-8 py-3.5 text-center text-sm font-semibold rounded-md uppercase',
          ]"
        >
          {{ tab.name }}
        </RouterLink>
      </nav>
    </div>
  </div>
  <div v-if="route.fullPath === tabs[0].href">
    <CardWorkout
      v-for="workout in workouts"
      :key="workout.id"
      :workout="workout"
    />
  </div>
  <AppList v-if="route.fullPath === tabs[2].href">
    <AppListItemLink
      v-for="followee in followees"
      :key="followee.id"
      :to="`/users/${followee.id}`"
    >
      {{ followee.firstName }} {{ followee.lastName }}
    </AppListItemLink>
  </AppList>
  <AppList v-if="route.fullPath === tabs[3].href">
    <AppListItemLink
      v-for="follower in followers"
      :key="follower.id"
      :to="`/users/${follower.id}`"
    >
      {{ follower.firstName }} {{ follower.lastName }}
    </AppListItemLink>
  </AppList>
</template>

<style scoped></style>
