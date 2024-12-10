<script setup lang="ts">
import { create } from '@bufbuild/protobuf'
import { useAuthStore } from '@/stores/auth.ts'
import { useRoute, useRouter } from 'vue-router'
import AppList from '@/ui/components/AppList.vue'
import { computed, onMounted, ref, watch } from 'vue'
import AppButton from '@/ui/components/AppButton.vue'
import { type User } from '@/proto/api/v1/shared_pb.ts'
import CardWorkout from '@/ui/components/CardWorkout.vue'
import AppListItem from '@/ui/components/AppListItem.vue'
import { usePageTitleStore } from '@/stores/pageTitle.ts'
import AppListItemLink from '@/ui/components/AppListItemLink.vue'
import { ExerciseClient, UserClient, WorkoutClient } from '@/http/clients'
import { ListWorkoutsRequestSchema, type Workout } from '@/proto/api/v1/workouts_pb'
import { GetPersonalBestsRequestSchema, type PersonalBest } from '@/proto/api/v1/exercise_pb.ts'
import {
  FollowRequestSchema, GetUserRequestSchema,
  ListFolloweesRequestSchema,
  ListFollowersRequestSchema,
  UnfollowRequestSchema
} from '@/proto/api/v1/users_pb.ts'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const pageTitleStore = usePageTitleStore()

const user = ref<User>()
const workouts = ref<Workout[]>()
const followers = ref<User[]>()
const followees = ref<User[]>()
const personalBests = ref<PersonalBest[]>()

const props = defineProps<{
  userId: string
}>()

watch(() => props.userId, async () => {
  if (props.userId === authStore.userID) {
    await router.push('/profile')
  }
})

onMounted(async () => {
  if (props.userId === authStore.userID) {
    await router.push('/profile')
  }

  await fetchUser()
  // DEBT: Fetch data for each tab separately.
  await Promise.all([fetchWorkouts(), fetchFollowers(), fetchFollowees(), fetchPersonalBests()])
})

const fetchUser = async () => {
  const req = create(GetUserRequestSchema, {
    id: props.userId,
  })
  const res = await UserClient.get(req)
  user.value = res.user
  if (user.value?.id !== authStore.userID) {
    pageTitleStore.setPageTitle(`${user.value?.firstName} ${user.value?.lastName}`)
  }
}

const fetchWorkouts = async () => {
  const req = create(ListWorkoutsRequestSchema, {
    pageSize: 100,
    pageToken: new Uint8Array(0),
    userIds: [user.value?.id || ''],
  })
  const res = await WorkoutClient.list(req)
  workouts.value = res.workouts
}

const fetchFollowers = async () => {
  const req = create(ListFollowersRequestSchema, {
    followerId: user.value?.id,
  })
  const res = await UserClient.listFollowers(req)
  followers.value = res.followers
}

const fetchFollowees = async () => {
  const req = create(ListFolloweesRequestSchema, {
    followeeId: user.value?.id,
  })
  const res = await UserClient.listFollowees(req)
  followees.value = res.followees
}

const fetchPersonalBests = async () => {
  const req = create(GetPersonalBestsRequestSchema, {
    userId: user.value?.id,
  })
  const res = await ExerciseClient.getPersonalBests(req)
  personalBests.value = res.personalBests
}

const followUser = async () => {
  const req = create(FollowRequestSchema, {
    followId: props.userId as string,
  })
  await UserClient.follow(req)
  await fetchUser()
  await fetchFollowers()
}

const unfollowUser = async () => {
  const req = create(UnfollowRequestSchema, {
    unfollowId: props.userId as string,
  })
  await UserClient.unfollow(req)
  await fetchUser()
  await fetchFollowers()
}

const baseUrl = computed(() => {
  if (user.value?.id !== authStore.userID) {
    return `/users/${user.value?.id}`
  }

  return '/profile'
})

const tabs = computed(() => [
  { href: baseUrl.value, name: 'Workouts' },
  { href: `${baseUrl.value}?tab=personal-bests`, name: 'Personal Bests' },
  { href: `${baseUrl.value}?tab=follows`, name: 'Follows' },
  { href: `${baseUrl.value}?tab=followers`, name: 'Followers' },
])

const activeTab = computed(() => route.fullPath)

const updateTab = (event: Event) => {
  const target = event.target as HTMLSelectElement
  router.push(target.value)
}
</script>

<template>
  <div v-if="userId === authStore.userID">
    <AppButton
      type="link"
      to="/logout"
      colour="red"
      container-class="px-4 pb-4"
    >
      Logout
    </AppButton>
  </div>
  <div v-else>
    <AppButton
      v-if="user?.followed"
      colour="gray"
      type="button"
      container-class="px-4 pb-4"
      @click="unfollowUser"
    >
      Unfollow {{ user?.firstName }}
    </AppButton>
    <AppButton
      v-else
      colour="primary"
      type="button"
      container-class="px-4 pb-4"
      @click="followUser"
    >
      Follow {{ user?.firstName }}
    </AppButton>
  </div>
  <div class="mb-4">
    <div class="sm:hidden">
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
      compact
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
