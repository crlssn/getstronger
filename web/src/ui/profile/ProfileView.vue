<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ArrowRightOnRectangleIcon,
  BellIcon,
  ChartBarIcon,
  ChevronRightIcon,
  UserCircleIcon,
} from '@heroicons/vue/24/outline'

import { getCurrentUser, updateUserDistanceUnit, updateUserWeightUnit } from '@/http/requests'
import { useAlertStore } from '@/stores/alerts'
import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import { useNotificationStore } from '@/stores/notifications'
import { usePreferencesStore } from '@/stores/preferences'
import { DistanceUnit, WeightUnit, type User } from '@/proto/api/v1/shared_pb'
import { normalizeWeightUnit } from '@/utils/weightUnits'
import { normalizeDistanceUnit } from '@/utils/distanceUnits'
import { formatNumber } from '@/utils/numbers'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const user = ref<User>()
const authStore = useAuthStore()
const dashboardStore = useDashboardStore()
const notificationStore = useNotificationStore()
const alertStore = useAlertStore()
const preferencesStore = usePreferencesStore()
const updatingWeightUnit = ref(false)
const updatingDistanceUnit = ref(false)

onMounted(async () => {
  const [response] = await Promise.all([
    getCurrentUser(authStore.userId),
    dashboardStore.load(),
    notificationStore.refreshUnreadNotifications(),
  ])
  if (response) {
    user.value = response.user
    preferencesStore.setWeightUnit(response.user?.weightUnit)
    preferencesStore.setDistanceUnit(response.user?.distanceUnit)
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

const distanceUnit = computed(() => preferencesStore.distanceUnit)

const setDistanceUnit = async (unit: DistanceUnit) => {
  const previous = preferencesStore.distanceUnit
  if (normalizeDistanceUnit(previous) === normalizeDistanceUnit(unit)) return

  preferencesStore.setDistanceUnit(unit)
  updatingDistanceUnit.value = true
  const res = await updateUserDistanceUnit(unit)
  updatingDistanceUnit.value = false

  // Same contract as the weight unit above: network-level failures resolve to
  // nothing, so the revert has to explain itself.
  if (!res) {
    preferencesStore.setDistanceUnit(previous)
    alertStore.setError(t('profile.distanceUnitUpdateFailed'))
    return
  }

  if (user.value) user.value.distanceUnit = normalizeDistanceUnit(res.user?.distanceUnit)
  alertStore.setSuccess(t('profile.distanceUnitUpdated'))
}

const initials = computed(
  () => `${user.value?.firstName.charAt(0) ?? ''}${user.value?.lastName.charAt(0) ?? ''}`,
)
const recentWorkoutCount = computed(() => dashboardStore.dashboard?.recentWorkouts.length ?? 0)
const weeklyVolume = computed(() => formatNumber(dashboardStore.dashboard?.volumeThisWeek ?? 0))
</script>

<template>
  <div v-if="user" class="profile-stack">
    <!-- A tab root opens with its own large title. This one used to open
         straight onto a card, which left it the only tab without one. -->
    <header class="page-intro">
      <h1>{{ $t('profile.heading') }}</h1>
    </header>

    <section class="profile-card">
      <div class="avatar">{{ initials }}</div>
      <div class="min-w-0">
        <p class="eyebrow">{{ $t('profile.account') }}</p>
        <h2>{{ user.firstName }} {{ user.lastName }}</h2>
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
        <strong>{{ weeklyVolume }} {{ $t('common.kg') }}</strong
        ><small>{{ $t('profile.thisWeek') }}</small>
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
      <div class="segmented" role="group" :aria-label="$t('profile.weightUnit')">
        <button
          type="button"
          :aria-pressed="weightUnit === WeightUnit.KILOGRAMS"
          :class="{ 'is-selected': weightUnit === WeightUnit.KILOGRAMS }"
          :disabled="updatingWeightUnit"
          @click="setWeightUnit(WeightUnit.KILOGRAMS)"
        >
          {{ $t('auth.kilograms') }}
        </button>
        <button
          type="button"
          :aria-pressed="weightUnit === WeightUnit.POUNDS"
          :class="{ 'is-selected': weightUnit === WeightUnit.POUNDS }"
          :disabled="updatingWeightUnit"
          @click="setWeightUnit(WeightUnit.POUNDS)"
        >
          {{ $t('auth.pounds') }}
        </button>
      </div>
    </section>

    <section class="preferences-card">
      <div>
        <strong>{{ $t('profile.distanceUnit') }}</strong>
        <small>{{ $t('profile.distanceUnitBody') }}</small>
      </div>
      <div class="segmented" role="group" :aria-label="$t('profile.distanceUnit')">
        <button
          type="button"
          :aria-pressed="distanceUnit === DistanceUnit.KILOMETERS"
          :class="{ 'is-selected': distanceUnit === DistanceUnit.KILOMETERS }"
          :disabled="updatingDistanceUnit"
          @click="setDistanceUnit(DistanceUnit.KILOMETERS)"
        >
          {{ $t('auth.kilometers') }}
        </button>
        <button
          type="button"
          :aria-pressed="distanceUnit === DistanceUnit.MILES"
          :class="{ 'is-selected': distanceUnit === DistanceUnit.MILES }"
          :disabled="updatingDistanceUnit"
          @click="setDistanceUnit(DistanceUnit.MILES)"
        >
          {{ $t('auth.miles') }}
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
  @apply grid size-16 place-items-center rounded-card bg-ink text-xl font-semibold text-white;
}
.eyebrow {
  @apply text-eyebrow font-bold uppercase text-text-subtle;
}
.page-intro h1 {
  @apply px-1 text-display font-bold text-text;
}
.profile-card h2 {
  @apply mt-1 truncate text-title font-semibold text-text;
}
.profile-card p:last-child {
  @apply mt-1 truncate text-sm text-text-subtle;
}
.notification-link {
  @apply relative grid size-14 place-items-center rounded-control text-text-muted transition hover:bg-ink-tint hover:text-text;
}
.notification-link > svg {
  @apply size-8;
}
.notification-badge {
  @apply absolute right-1 top-1 grid min-h-[22px] min-w-[22px] place-items-center rounded-full bg-badge px-1 text-eyebrow font-bold tracking-normal leading-none text-white ring-[3px] ring-white;
}
.stats-strip {
  @apply card grid grid-cols-3 divide-x divide-border p-4;
}
.stats-strip article {
  @apply grid min-w-0 gap-1 px-3 first:pl-0 last:pr-0;
}
.stats-strip strong {
  @apply truncate text-base font-semibold tracking-tight text-text sm:text-lg;
}
.stats-strip small {
  @apply text-xs text-text-subtle;
}
.settings-card {
  @apply card divide-y divide-border overflow-hidden;
}
.settings-card a {
  @apply grid grid-cols-[auto_1fr_auto] items-center gap-3 p-4 transition hover:bg-ink-surface hover:text-ink-strong;
}
.settings-card > a > svg {
  @apply size-5 text-text-subtle;
}
.settings-icon {
  @apply grid size-11 place-items-center rounded-control bg-ink-tint text-ink-strong;
}
.settings-icon svg {
  @apply size-5;
}
.settings-card strong,
.settings-card small {
  @apply block;
}
.settings-card small {
  @apply mt-0.5 text-sm text-text-subtle;
}
/* Stacked on a phone. Squeezing a segmented control into what is left of a row
   hides its second option behind a scroll nobody can see. */
.preferences-card {
  @apply card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between;
}
.preferences-card strong,
.preferences-card small {
  @apply block;
}
.preferences-card strong {
  @apply text-base font-semibold text-text;
}
.preferences-card small {
  @apply mt-0.5 text-sm text-text-subtle;
}
.logout-link {
  @apply inline-flex min-h-(--size-control) w-full items-center justify-center gap-2 rounded-control border border-danger/30 bg-white px-4 text-sm font-semibold text-danger hover:bg-danger-surface hover:text-danger-strong;
}
.logout-link svg {
  @apply size-5;
}
</style>
