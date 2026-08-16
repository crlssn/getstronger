<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ArrowRightOnRectangleIcon,
  BellIcon,
  ChartBarIcon,
  ChevronRightIcon,
  UserCircleIcon,
} from '@heroicons/vue/24/outline'

import { getCurrentUser, updateUserWeightUnit } from '@/http/requests'
import { useAlertStore } from '@/stores/alerts'
import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import { useNotificationStore } from '@/stores/notifications'
import { usePreferencesStore } from '@/stores/preferences'
import { WeightUnit, type User } from '@/proto/api/v1/shared_pb'
import { normalizeWeightUnit } from '@/utils/weightUnits'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const user = ref<User>()
const authStore = useAuthStore()
const dashboardStore = useDashboardStore()
const notificationStore = useNotificationStore()
const alertStore = useAlertStore()
const preferencesStore = usePreferencesStore()
const updatingWeightUnit = ref(false)

onMounted(async () => {
  const [response] = await Promise.all([
    getCurrentUser(authStore.userId),
    dashboardStore.load(),
    notificationStore.refreshUnreadNotifications(),
  ])
  if (response) {
    user.value = response.user
    preferencesStore.setWeightUnit(response.user?.weightUnit)
  }
})

const weightUnit = computed(() => preferencesStore.weightUnit)

const setWeightUnit = async (unit: WeightUnit) => {
  const previous = preferencesStore.weightUnit
  if (normalizeWeightUnit(previous) === normalizeWeightUnit(unit)) return

  preferencesStore.setWeightUnit(unit)
  updatingWeightUnit.value = true
  const res = await updateUserWeightUnit(unit)
  updatingWeightUnit.value = false

  // The request helper stays silent for network-level failures (Unavailable,
  // Unknown, Canceled), which is exactly when this reverts. Say so explicitly,
  // or the button appears to snap back on its own.
  if (!res) {
    preferencesStore.setWeightUnit(previous)
    alertStore.setError(t('profile.weightUnitUpdateFailed'))
    return
  }

  if (user.value) user.value.weightUnit = normalizeWeightUnit(res.user?.weightUnit)
  alertStore.setSuccess(t('profile.weightUnitUpdated'))
}

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
        <p class="eyebrow">{{ $t('profile.account') }}</p>
        <h1>{{ user.firstName }} {{ user.lastName }}</h1>
        <p>{{ user.email }}</p>
      </div>
      <RouterLink
        to="/notifications"
        class="notification-link"
        :aria-label="$t('profile.notifications')"
      >
        <BellIcon />
        <span v-if="notificationStore.unreadCount" class="notification-badge">
          {{ notificationStore.unreadCount > 99 ? '99+' : notificationStore.unreadCount }}
        </span>
      </RouterLink>
    </section>

    <section class="stats-strip" :aria-label="$t('profile.trainingSummary')">
      <article>
        <strong>{{ recentWorkoutCount }}</strong
        ><small>{{ $t('profile.workouts') }}</small>
      </article>
      <article>
        <strong>{{ dashboardStore.dashboard?.personalBests.length ?? 0 }}</strong
        ><small>{{ $t('profile.records') }}</small>
      </article>
      <article>
        <strong>{{ weeklyVolume }} kg</strong><small>{{ $t('profile.thisWeek') }}</small>
      </article>
    </section>

    <section class="settings-card">
      <RouterLink to="/progress"
        ><span class="settings-icon"><ChartBarIcon /></span
        ><span
          ><strong>{{ $t('profile.progress') }}</strong
          ><small>{{ $t('profile.progressBody') }}</small></span
        ><ChevronRightIcon
      /></RouterLink>
      <RouterLink :to="`/users/${user.id}`"
        ><span class="settings-icon"><UserCircleIcon /></span
        ><span
          ><strong>{{ $t('profile.publicProfile') }}</strong
          ><small>{{ $t('profile.publicProfileBody') }}</small></span
        ><ChevronRightIcon
      /></RouterLink>
    </section>

    <section class="preferences-card">
      <div>
        <strong>{{ $t('profile.weightUnit') }}</strong>
        <small>{{ $t('profile.weightUnitBody') }}</small>
      </div>
      <div class="weight-unit-picker" role="group" :aria-label="$t('profile.weightUnit')">
        <button
          type="button"
          :aria-pressed="weightUnit === WeightUnit.KILOGRAMS"
          :class="{ active: weightUnit === WeightUnit.KILOGRAMS }"
          :disabled="updatingWeightUnit"
          @click="setWeightUnit(WeightUnit.KILOGRAMS)"
        >
          {{ $t('auth.kilograms') }}
        </button>
        <button
          type="button"
          :aria-pressed="weightUnit === WeightUnit.POUNDS"
          :class="{ active: weightUnit === WeightUnit.POUNDS }"
          :disabled="updatingWeightUnit"
          @click="setWeightUnit(WeightUnit.POUNDS)"
        >
          {{ $t('auth.pounds') }}
        </button>
      </div>
    </section>

    <RouterLink to="/logout" class="logout-link"
      ><ArrowRightOnRectangleIcon /> {{ $t('auth.logout') }}</RouterLink
    >
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.profile-stack {
  @apply mx-auto max-w-3xl space-y-5;
}
.profile-card {
  @apply card grid grid-cols-[auto_1fr_auto] items-center gap-4 p-5;
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
  @apply relative grid size-14 place-items-center rounded-xl text-stone-700 transition hover:bg-stone-100 hover:text-stone-950;
}
.notification-link > svg {
  @apply size-8;
}
.notification-badge {
  @apply absolute right-1 top-1 grid min-h-[22px] min-w-[22px] place-items-center rounded-full bg-red-600 px-1 text-[0.6875rem] font-bold leading-none text-white ring-[3px] ring-white;
}
.stats-strip {
  @apply card grid grid-cols-3 divide-x divide-slate-200 p-4;
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
  @apply card divide-y divide-slate-100 overflow-hidden;
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
.preferences-card {
  @apply card flex items-center justify-between gap-4 p-4;
}
.preferences-card strong,
.preferences-card small {
  @apply block;
}
.preferences-card strong {
  @apply text-base font-semibold text-slate-950;
}
.preferences-card small {
  @apply mt-0.5 text-sm text-slate-500;
}
.weight-unit-picker {
  @apply grid grid-cols-2 overflow-hidden rounded-full border border-slate-200;
}
.weight-unit-picker button {
  @apply min-w-16 px-4 py-2 text-sm font-semibold text-slate-600 transition disabled:opacity-60;
}
.weight-unit-picker button + button {
  @apply border-l border-slate-200;
}
.weight-unit-picker button.active {
  @apply bg-stone-900 text-white;
}
.logout-link {
  @apply inline-flex min-h-(--size-control) w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 hover:bg-red-50;
}
.logout-link svg {
  @apply size-5;
}
</style>
