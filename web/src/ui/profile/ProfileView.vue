<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { WorkoutClient } from '@/clients/clients'
import { ListWorkoutsRequestSchema, type Workout } from '@/proto/api/v1/workouts_pb'
import { useRoute } from 'vue-router'
import router from '@/router/router'
import { create } from '@bufbuild/protobuf'
import CardWorkout from '@/ui/components/CardWorkout.vue'
import AppButton from '@/ui/components/AppButton.vue'

const workouts = ref<Workout[]>()
const route = useRoute()

onMounted(async () => {
  await fetchWorkouts()
})

const fetchWorkouts = async () => {
  const req = create(ListWorkoutsRequestSchema, {
    pageSize: 100,
    pageToken: new Uint8Array(0),
  })
  const res = await WorkoutClient.list(req)
  workouts.value = res.workouts
}

const tabs = [
  { name: 'Workouts', href: '/profile' },
  { name: 'Personal Bests', href: '/profile?tab=personal-bests' },
  { name: 'Follows', href: '/profile?tab=follows' },
  { name: 'Followers', href: '/profile?tab=followers' },
]

const updateTab = (event: Event) => {
  const target = event.target as HTMLSelectElement
  router.push(target.value)
}
</script>

<template>
  <div>
    <AppButton type="link" to="/settings" colour="gray">Settings</AppButton>
    <AppButton type="link" to="/logout" colour="red">Logout</AppButton>
  </div>
  <div class="mb-4">
    <div class="sm:hidden">
      <select
        id="tabs"
        name="tabs"
        @change="updateTab"
        class="block w-full rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 py-4 px-5 font-medium text-sm"
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
      <div class="border border-gray-200 bg-white rounded-md">
        <nav class="-mb-px flex" aria-label="Tabs">
          <RouterLink
            v-for="tab in tabs"
            :key="tab.name"
            :to="tab.href"
            :class="[
              tab.href === route.fullPath
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              'w-1/4 border-b-2 px-1 py-4 text-center text-sm font-medium',
            ]"
          >
            {{ tab.name }}
          </RouterLink>
        </nav>
      </div>
    </div>
  </div>
  <div v-if="route.fullPath === tabs[0].href">
    <CardWorkout v-for="workout in workouts" :key="workout.id" :workout="workout"></CardWorkout>
  </div>
</template>

<style scoped></style>
