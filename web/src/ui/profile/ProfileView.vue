<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ArrowRightOnRectangleIcon,
  BellIcon,
  ChartBarIcon,
  ChevronRightIcon,
  TrophyIcon,
  UserCircleIcon,
} from '@heroicons/vue/24/outline'

import { getUser } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import type { User } from '@/proto/api/v1/shared_pb'

const user = ref<User>()
const authStore = useAuthStore()
const dashboardStore = useDashboardStore()

onMounted(async () => {
  const [response] = await Promise.all([getUser(authStore.userId), dashboardStore.load()])
  if (response) user.value = response.user
})

const initials = computed(() => `${user.value?.firstName.charAt(0) ?? ''}${user.value?.lastName.charAt(0) ?? ''}`)
const recentWorkoutCount = computed(() => dashboardStore.dashboard?.recentWorkouts.length ?? 0)
</script>

<template>
  <div v-if="user" class="profile-stack">
    <section class="profile-card">
      <div class="avatar">{{ initials }}</div>
      <div class="min-w-0"><p class="eyebrow">Your account</p><h1>{{ user.firstName }} {{ user.lastName }}</h1><p>{{ user.email }}</p></div>
    </section>

    <section class="stats-grid">
      <article><span>Recent workouts</span><strong>{{ recentWorkoutCount }}</strong><small>Loaded in your dashboard</small></article>
      <article><span>Personal records</span><strong>{{ dashboardStore.dashboard?.personalBests.length ?? 0 }}</strong><small>Across all exercises</small></article>
    </section>

    <section class="settings-card">
      <RouterLink to="/progress"><span class="settings-icon"><ChartBarIcon /></span><span><strong>Progress</strong><small>Volume and personal records</small></span><ChevronRightIcon /></RouterLink>
      <RouterLink to="/notifications"><span class="settings-icon"><BellIcon /></span><span><strong>Notifications</strong><small>Comments and new followers</small></span><ChevronRightIcon /></RouterLink>
      <RouterLink :to="`/users/${user.id}/personal-bests`"><span class="settings-icon"><TrophyIcon /></span><span><strong>Record history</strong><small>Explore every best set</small></span><ChevronRightIcon /></RouterLink>
      <RouterLink :to="`/users/${user.id}`"><span class="settings-icon"><UserCircleIcon /></span><span><strong>Public profile</strong><small>See what friends can view</small></span><ChevronRightIcon /></RouterLink>
    </section>

    <RouterLink to="/logout" class="logout-link"><ArrowRightOnRectangleIcon /> Log out</RouterLink>
  </div>
</template>

<style scoped>
.profile-stack { @apply mx-auto max-w-3xl space-y-5; }
.profile-card { @apply grid grid-cols-[auto_1fr] items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm; }
.avatar { @apply grid size-16 place-items-center rounded-2xl bg-indigo-600 text-xl font-semibold text-white; }
.eyebrow { @apply text-xs font-semibold uppercase tracking-wider text-slate-500; }
h1 { @apply mt-1 truncate text-2xl font-semibold tracking-tight text-slate-950; }
.profile-card p:last-child { @apply mt-1 truncate text-sm text-slate-500; }
.stats-grid { @apply grid gap-4 sm:grid-cols-2; }
.stats-grid article { @apply grid gap-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm; }
.stats-grid span, .stats-grid small { @apply text-sm text-slate-500; }
.stats-grid strong { @apply text-2xl font-semibold tracking-tight; }
.settings-card { @apply divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm; }
.settings-card a { @apply grid grid-cols-[auto_1fr_auto] items-center gap-3 p-4 transition hover:bg-slate-50 hover:text-indigo-700; }
.settings-card > a > svg { @apply size-5 text-slate-400; }
.settings-icon { @apply grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600; }
.settings-icon svg { @apply size-5; }
.settings-card strong, .settings-card small { @apply block; }
.settings-card small { @apply mt-0.5 text-sm text-slate-500; }
.logout-link { @apply inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 hover:bg-red-50; }
.logout-link svg { @apply size-5; }
</style>
