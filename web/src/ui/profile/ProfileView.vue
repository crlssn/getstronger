<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ArrowRightOnRectangleIcon,
  BellIcon,
  ChartBarIcon,
  ChevronRightIcon,
  PencilSquareIcon,
  UserCircleIcon,
} from '@heroicons/vue/24/outline'

import {
  getCurrentUser,
  updateUserAutofillSets,
  updateUserDistanceUnit,
  updateUserName,
  updateUserUsername,
  updateUserWeightUnit,
} from '@/http/requests'
import AppSheet from '@/ui/components/AppSheet.vue'
import AppSkeleton from '@/ui/components/AppSkeleton.vue'
import { useAlertStore } from '@/stores/alerts'
import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import { useNotificationStore } from '@/stores/notifications'
import { usePreferencesStore } from '@/stores/preferences'
import { DistanceUnit, WeightUnit, type User } from '@/proto/api/v1/shared_pb'
import { normalizeWeightUnit } from '@/utils/weightUnits'
import { normalizeDistanceUnit } from '@/utils/distanceUnits'
import { formatNumber } from '@/utils/numbers'
import { handle, initials } from '@/utils/names'
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
const updatingAutofillSets = ref(false)

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
    preferencesStore.setAutofillSets(response.user?.autofillSets)
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

const autofillSets = computed(() => preferencesStore.autofillSets)

const setAutofillSets = async (enabled: boolean) => {
  const previous = preferencesStore.autofillSets
  if (previous === enabled) return

  preferencesStore.setAutofillSets(enabled)
  updatingAutofillSets.value = true
  const res = await updateUserAutofillSets(enabled)
  updatingAutofillSets.value = false

  // Same contract as the units above: a network failure resolves to nothing,
  // so the revert has to explain itself.
  if (!res) {
    preferencesStore.setAutofillSets(previous)
    alertStore.setError(t('profile.autofillSetsUpdateFailed'))
    return
  }

  if (user.value) user.value.autofillSets = res.user?.autofillSets ?? enabled
  alertStore.setSuccess(t('profile.autofillSetsUpdated'))
}

const userInitials = computed(() => initials(user.value?.name))

const editingName = ref(false)
const nameDraft = ref('')
const savingName = ref(false)

const openNameEditor = () => {
  nameDraft.value = user.value?.name ?? ''
  editingName.value = true
}

const saveName = async () => {
  if (!user.value || savingName.value) return

  savingName.value = true
  const res = await updateUserName(nameDraft.value)
  savingName.value = false

  // Failures surface through the request helper's alert, so the sheet stays
  // open for the draft to be corrected.
  if (!res) return

  user.value.name = res.user?.name ?? nameDraft.value
  editingName.value = false
  alertStore.setSuccess(t('profile.nameUpdated'))
}

const editingUsername = ref(false)
const usernameDraft = ref('')
const savingUsername = ref(false)

const openUsernameEditor = () => {
  usernameDraft.value = user.value?.username ?? ''
  editingUsername.value = true
}

const saveUsername = async () => {
  if (!user.value || savingUsername.value) return

  savingUsername.value = true
  const res = await updateUserUsername(usernameDraft.value)
  savingUsername.value = false

  // Failures — including a taken username — surface through the request
  // helper's alert, so the sheet stays open for the draft to be corrected.
  if (!res) return

  user.value.username = res.user?.username ?? usernameDraft.value
  editingUsername.value = false
  alertStore.setSuccess(t('profile.usernameUpdated'))
}
const recentWorkoutCount = computed(() => dashboardStore.dashboard?.recentWorkouts.length ?? 0)
const weeklyVolume = computed(() => formatNumber(dashboardStore.dashboard?.volumeThisWeek ?? 0))
</script>

<template>
  <AppSkeleton v-if="!user" />
  <div v-else class="profile-stack">
    <!-- A tab root opens with its own large title. This one used to open
         straight onto a card, which left it the only tab without one. -->
    <header class="page-intro">
      <h1>{{ $t('profile.heading') }}</h1>
    </header>

    <section class="profile-card">
      <div class="avatar">{{ userInitials }}</div>
      <div class="min-w-0">
        <p class="eyebrow">{{ $t('profile.account') }}</p>
        <div class="name-line">
          <h2>{{ user.name }}</h2>
          <button type="button" :aria-label="$t('profile.editName')" @click="openNameEditor">
            <PencilSquareIcon />
          </button>
        </div>
        <p class="username-line">
          <span class="truncate">{{ handle(user.username) }}</span>
          <button
            type="button"
            :aria-label="$t('profile.editUsername')"
            @click="openUsernameEditor"
          >
            <PencilSquareIcon />
          </button>
        </p>
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

    <section class="preferences-card">
      <div>
        <strong>{{ $t('profile.autofillSets') }}</strong>
        <small>{{ $t('profile.autofillSetsBody') }}</small>
      </div>
      <div class="segmented" role="group" :aria-label="$t('profile.autofillSets')">
        <button
          type="button"
          :aria-pressed="!autofillSets"
          :class="{ 'is-selected': !autofillSets }"
          :disabled="updatingAutofillSets"
          @click="setAutofillSets(false)"
        >
          {{ $t('profile.autofillSetsOff') }}
        </button>
        <button
          type="button"
          :aria-pressed="autofillSets"
          :class="{ 'is-selected': autofillSets }"
          :disabled="updatingAutofillSets"
          @click="setAutofillSets(true)"
        >
          {{ $t('profile.autofillSetsOn') }}
        </button>
      </div>
    </section>

    <RouterLink to="/logout" class="logout-link"
      ><ArrowRightOnRectangleIcon /> {{ $t('auth.logout') }}</RouterLink
    >

    <AppSheet
      v-if="editingName"
      :title="$t('profile.editName')"
      :close-label="$t('common.close')"
      @close="editingName = false"
    >
      <form id="name-form" @submit.prevent="saveName">
        <label for="edit-name" class="auth-label">{{ $t('auth.name') }}</label>
        <input
          id="edit-name"
          v-model="nameDraft"
          name="name"
          type="text"
          autocomplete="name"
          class="auth-input mt-2"
          required
        />
      </form>
      <template #actions>
        <button type="submit" form="name-form" class="primary" :disabled="savingName">
          {{ $t('common.save') }}
        </button>
      </template>
    </AppSheet>

    <AppSheet
      v-if="editingUsername"
      :title="$t('profile.editUsername')"
      :close-label="$t('common.close')"
      @close="editingUsername = false"
    >
      <form id="username-form" @submit.prevent="saveUsername">
        <label for="edit-username" class="auth-label">{{ $t('auth.username') }}</label>
        <p class="mt-1 text-sm text-text-subtle">{{ $t('auth.usernameHelp') }}</p>
        <input
          id="edit-username"
          v-model="usernameDraft"
          name="username"
          type="text"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          class="auth-input mt-2"
          minlength="3"
          maxlength="30"
          pattern="[A-Za-z0-9._]+"
          required
          @input="usernameDraft = usernameDraft.toLowerCase()"
        />
      </form>
      <template #actions>
        <button type="submit" form="username-form" class="primary" :disabled="savingUsername">
          {{ $t('common.save') }}
        </button>
      </template>
    </AppSheet>
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
  @apply truncate text-title font-semibold text-text;
}
.profile-card p:last-child {
  @apply mt-1 truncate text-sm text-text-subtle;
}
/* Each pencil is a full-size tap target, so its row's text centers against it
   with negative margins instead of growing the card. The name keeps its own
   heading element, so the pencil stays out of the heading's accessible name. */
.name-line,
.username-line {
  @apply -my-2 flex items-center gap-0.5;
}
.username-line {
  @apply text-sm text-text-muted;
}
.name-line button,
.username-line button {
  @apply grid size-11 shrink-0 place-items-center rounded-control text-text-subtle transition hover:bg-ink-tint hover:text-text;
}
.name-line button svg,
.username-line button svg {
  @apply size-4;
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
