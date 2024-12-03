<script setup lang="ts">
import router from '@/router/router'
import { useRoute } from 'vue-router'
import { create } from '@bufbuild/protobuf'
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth.ts'
import AppList from '@/ui/components/AppList.vue'
import AppButton from '@/ui/components/AppButton.vue'
import { type User } from '@/proto/api/v1/shared_pb.ts'
import CardWorkout from '@/ui/components/CardWorkout.vue'
import AppListItem from '@/ui/components/AppListItem.vue'
import AppListItemLink from '@/ui/components/AppListItemLink.vue'
import { ExerciseClient, UserClient, WorkoutClient } from '@/clients/clients'
import { ListWorkoutsRequestSchema, type Workout } from '@/proto/api/v1/workouts_pb'
import { GetPersonalBestsRequestSchema, type PersonalBest } from '@/proto/api/v1/exercise_pb.ts'
import { ListFolloweesRequestSchema, ListFollowersRequestSchema } from '@/proto/api/v1/users_pb.ts'

const route = useRoute()
const authStore = useAuthStore()

const workouts = ref<Workout[]>()
const followers = ref<User[]>()
const followees = ref<User[]>()
const personalBests = ref<PersonalBest[]>()

onMounted(async () => {
  // DEBT: Fetch data for each tab separately.
  await Promise.all([fetchWorkouts(), fetchFollowers(), fetchFollowees(), fetchPersonalBests()])
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

const fetchPersonalBests = async () => {
  const req = create(GetPersonalBestsRequestSchema, {
    userId: authStore.userID,
  })
  const res = await ExerciseClient.getPersonalBests(req)
  personalBests.value = res.personalBests
}

const tabs = [
  { href: '/profile', name: 'Workouts' },
  { href: '/profile?tab=personal-bests', name: 'Personal Bests' },
  { href: '/profile?tab=follows', name: 'Follows' },
  { href: '/profile?tab=followers', name: 'Followers' },
]

const activeTab = computed(() => route.fullPath)

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
          :selected="tab.href === activeTab"
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
            tab.href === activeTab
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
  <div v-if="activeTab === tabs[0].href">
    <CardWorkout
      v-for="workout in workouts"
      :key="workout.id"
      :workout="workout"
    />
  </div>
  <AppList v-if="activeTab === tabs[1].href">
    <AppListItem
      v-for="personalBest in personalBests"
      :key="personalBest?.exercise?.id"
    >
      <p class="font-medium">
        {{ personalBest?.exercise?.name }}
        <small v-if="personalBest?.exercise?.label">
          {{ personalBest.exercise.label }}
        </small>
      </p>
      {{ personalBest?.set?.weight }} kg x {{ personalBest?.set?.reps }}
    </AppListItem>
  </AppList>
  <AppList v-if="activeTab === tabs[2].href">
    <AppListItemLink
      v-for="followee in followees"
      :key="followee.id"
      :to="`/users/${followee.id}`"
    >
      {{ followee.firstName }} {{ followee.lastName }}
    </AppListItemLink>
  </AppList>
  <AppList v-if="activeTab === tabs[3].href">
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
