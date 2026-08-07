<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ArrowRightOnRectangleIcon,
  BellIcon,
  ChartBarIcon,
  ChevronRightIcon,
  UserCircleIcon,
} from '@heroicons/vue/24/outline'

import { getUser } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import { useNotificationStore } from '@/stores/notifications'
import type { User } from '@/proto/api/v1/shared_pb'

const user = ref<User>()
const authStore = useAuthStore()
const dashboardStore = useDashboardStore()
const notificationStore = useNotificationStore()

onMounted(async () => {
  const [response] = await Promise.all([getUser(authStore.userId), dashboardStore.load()])
  if (response) user.value = response.user
})

const initials = computed(
  () => `${user.value?.firstName.charAt(0) ?? ''}${user.value?.lastName.charAt(0) ?? ''}`,
)
const recentWorkoutCount = computed(() => dashboardStore.dashboard?.recentWorkouts.length ?? 0)
const weeklyVolume = computed(() =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    dashboardStore.dashboard?.volumeThisWeek ?? 0,
  ),
)
</script>

<template>
  <div v-if="user" class="profile-stack">
    <section class="profile-card">
      <div class="avatar">{{ initials }}</div>
      <div class="min-w-0">
        <p class="eyebrow">Your account</p>
        <h1>{{ user.firstName }} {{ user.lastName }}</h1>
        <p>{{ user.email }}</p>
      </div>
      <RouterLink to="/notifications" class="notification-link" aria-label="Notifications">
        <BellIcon />
        <span v-if="notificationStore.unreadCount" class="notification-badge">
          {{ notificationStore.unreadCount > 99 ? '99+' : notificationStore.unreadCount }}
        </span>
      </RouterLink>
    </section>

    <section class="stats-strip" aria-label="Training summary">
      <article>
        <strong>{{ recentWorkoutCount }}</strong
        ><small>workouts</small>
      </article>
      <article>
        <strong>{{ dashboardStore.dashboard?.personalBests.length ?? 0 }}</strong
        ><small>records</small>
      </article>
      <article>
        <strong>{{ weeklyVolume }} kg</strong><small>this week</small>
      </article>
    </section>

    <section class="settings-card">
      <RouterLink to="/progress"
        ><span class="settings-icon"><ChartBarIcon /></span
        ><span
          ><strong>Progress &amp; records</strong
          ><small>Volume trends and personal bests</small></span
        ><ChevronRightIcon
      /></RouterLink>
      <RouterLink :to="`/users/${user.id}`"
        ><span class="settings-icon"><UserCircleIcon /></span
        ><span><strong>Public profile</strong><small>See what friends can view</small></span
        ><ChevronRightIcon
      /></RouterLink>
    </section>

    <RouterLink to="/logout" class="logout-link"><ArrowRightOnRectangleIcon /> Log out</RouterLink>
  </div>
</template>

<style scoped>
.profile-stack {
  @apply mx-auto max-w-3xl space-y-5;
}
.profile-card {
  @apply grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm;
}
.avatar {
  @apply grid size-16 place-items-center rounded-2xl bg-indigo-600 text-xl font-semibold text-white;
}
.eyebrow {
  @apply text-xs font-semibold uppercase tracking-wider text-slate-500;
}
h1 {
  @apply mt-1 truncate text-2xl font-semibold tracking-tight text-slate-950;
}
.profile-card p:last-child {
  @apply mt-1 truncate text-sm text-slate-500;
}
.notification-link {
  @apply relative grid size-11 place-items-center rounded-xl text-stone-700 transition hover:bg-stone-100 hover:text-stone-950;
}
.notification-link > svg {
  @apply size-6;
}
.notification-badge {
  @apply absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[0.625rem] font-bold leading-none text-white;
}
.stats-strip {
  @apply grid grid-cols-3 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm;
}
.stats-strip article {
  @apply grid min-w-0 gap-1 px-3 first:pl-0 last:pr-0;
}
.stats-strip strong {
  @apply truncate text-base font-semibold tracking-tight text-slate-950 sm:text-lg;
}
.stats-strip small {
  @apply text-xs text-slate-500;
}
.settings-card {
  @apply divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm;
}
.settings-card a {
  @apply grid grid-cols-[auto_1fr_auto] items-center gap-3 p-4 transition hover:bg-slate-50 hover:text-indigo-700;
}
.settings-card > a > svg {
  @apply size-5 text-slate-400;
}
.settings-icon {
  @apply grid size-11 place-items-center rounded-xl bg-indigo-100 text-indigo-700;
}
.settings-icon svg {
  @apply size-5;
}
.settings-card strong,
.settings-card small {
  @apply block;
}
.settings-card small {
  @apply mt-0.5 text-sm text-slate-500;
}
.logout-link {
  @apply inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 hover:bg-red-50;
}
.logout-link svg {
  @apply size-5;
}
</style>
