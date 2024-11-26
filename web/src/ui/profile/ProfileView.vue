<script setup lang="ts">
import { WorkoutClient } from '@/clients/clients'
import { ListWorkoutsRequestSchema, type Workout } from '@/proto/api/v1/workouts_pb'
import router from '@/router/router'
import AppButton from '@/ui/components/AppButton.vue'
import CardWorkout from '@/ui/components/CardWorkout.vue'
import { create } from '@bufbuild/protobuf'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

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
</template>

<style scoped></style>
