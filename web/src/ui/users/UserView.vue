<script setup lang="ts">
import router from '@/router/router'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { create } from '@bufbuild/protobuf'
import { UserClient, WorkoutClient } from '@/clients/clients'
import CardWorkout from '@/ui/components/CardWorkout.vue'
import { ListWorkoutsRequestSchema, type Workout } from '@/proto/api/v1/workouts_pb'
import { usePageTitleStore } from '@/stores/pageTitle.ts'
import { GetUserRequestSchema } from '@/proto/api/v1/users_pb.ts'
import { type User } from '@/proto/api/v1/shared_pb.ts'

const workouts = ref<Workout[]>()
const route = useRoute()
const pageTitleStore = usePageTitleStore()
const user = ref({} as undefined | User)

onMounted(async () => {
  await fetchWorkouts()
  await fetchUser()
})

const fetchUser = async () => {
  const req = create(GetUserRequestSchema, {
    id: route.params.id as string,
  })
  const res = await UserClient.get(req)
  user.value = res.user
  pageTitleStore.setPageTitle(`${user.value?.firstName} ${user.value?.lastName}`)
}

const fetchWorkouts = async () => {
  const req = create(ListWorkoutsRequestSchema, {
    pageSize: 100,
    pageToken: new Uint8Array(0),
    userIds: [route.params.id as string],
  })
  const res = await WorkoutClient.list(req)
  workouts.value = res.workouts
}

const tabs = [
  { href: `/users/${route.params.id}`, name: 'Workouts' },
  { href: `/users/${route.params.id}?tab=personal-bests`, name: 'Personal Bests' },
  { href: `/users/${route.params.id}?tab=follows`, name: 'Follows' },
  { href: `/users/${route.params.id}?tab=followers`, name: 'Followers' },
]

const updateTab = (event: Event) => {
  const target = event.target as HTMLSelectElement
  router.push(target.value)
}
</script>

<template>
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
      <nav class="flex" aria-label="Tabs">
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
    <CardWorkout v-for="workout in workouts" :key="workout.id" :workout="workout" />
  </div>
</template>

<style scoped></style>
