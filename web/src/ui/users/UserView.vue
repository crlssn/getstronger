<script setup lang="ts">
import { useAuthStore } from '@/stores/auth.ts'
import { useRoute } from 'vue-router'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppButton from '@/ui/components/AppButton.vue'
import AppSkeleton from '@/ui/components/AppSkeleton.vue'
import DropdownButton from '@/ui/components/DropdownButton.vue'
import type { DropdownItem } from '@/types/dropdown'
import { type User } from '@/proto/api/v1/shared_pb.ts'
import { followUser, getUser, listWorkouts, unfollowUser } from '@/http/requests.ts'
import { usePageTitleStore } from '@/stores/pageTitle.ts'
import WorkoutChart from '@/ui/components/WorkoutChart.vue'
import AppCard from '@/ui/components/AppCard.vue'
import type { Workout } from '@/proto/api/v1/workout_service_pb.ts'
import posthog from '@/posthog'

const { t } = useI18n()
const route = useRoute()
const authStore = useAuthStore()
const pageTitleStore = usePageTitleStore()

const user = ref({} as User)
const workouts = ref([] as Workout[])

const tabs = computed(() => [
  { href: `/users/${user.value.id}`, name: t('common.workouts') },
  { href: `/users/${user.value.id}/personal-bests`, name: t('profile.personalBests') },
  { href: `/users/${user.value.id}/follows`, name: t('profile.follows') },
  { href: `/users/${user.value.id}/followers`, name: t('profile.followers') },
])

const activeTab = computed(() => route.path)
const pageTitle = computed(() => {
  if (user.value.id === authStore.userId) return t('nav.me')
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
  // We only care about the most recent workouts for the chart.
  const res = await listWorkouts([user.value.id], new Uint8Array(0))
  if (!res) return

  workouts.value = res.workouts
}

const fetchUser = async () => {
  const res = await getUser(route.params.id as string)
  if (!res) return

  user.value = res.user as User
}

const onFollowUser = async () => {
  const response = await followUser(user.value.id)
  if (!response) return
  posthog.capture('user_followed')
  await fetchUser()
}

const onUnfollowUser = async () => {
  const response = await unfollowUser(user.value.id)
  if (!response) return
  posthog.capture('user_unfollowed')
  await fetchUser()
}

const notMe = computed(() => Boolean(user.value.id) && user.value.id !== authStore.userId)
const followed = computed(() => user.value.followed)
const profileActions = computed<DropdownItem[]>(() => [
  { func: () => onUnfollowUser(), title: t('profile.unfollow', { name: user.value.firstName }) },
])
</script>

<template>
  <Teleport v-if="notMe && followed" to="#page-nav-action">
    <DropdownButton :label="t('profile.actionsLabel')" :items="profileActions" />
  </Teleport>

  <div v-if="notMe && !followed" class="profile-action">
    <AppButton colour="primary" type="button" @click="onFollowUser">
      {{ t('profile.follow', { name: user.firstName }) }}
    </AppButton>
  </div>

  <!-- We need at least two data points to show a trend -->
  <div v-if="workouts.length > 1">
    <h6>{{ t('profile.trend') }}</h6>
    <AppCard class="p-2">
      <WorkoutChart :workouts="workouts" />
    </AppCard>
  </div>

  <AppSkeleton v-if="!user.id" class="profile-tabs" />
  <nav v-if="user.id" class="profile-tabs segmented" :aria-label="t('profile.sectionsAria')">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.name"
      :to="tab.href"
      :class="{ 'is-selected': tab.href === activeTab }"
      :aria-current="tab.href === activeTab ? 'page' : undefined"
    >
      {{ tab.name }}
    </RouterLink>
  </nav>

  <router-view :page-title="pageTitle" />
</template>

<style scoped>
@reference '../../assets/base.css';

.profile-action {
  @apply mb-4;
}
.profile-tabs {
  @apply mb-4;
}
</style>
