<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { DateTime } from 'luxon'
import { FireIcon } from '@heroicons/vue/24/outline'

import { listWorkouts } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const loaded = ref(false)
const streak = ref(0)
const thisWeekLogged = ref(false)

const weekKey = (dateTime: DateTime) => `${dateTime.weekYear}-${dateTime.weekNumber}`

const computeStreak = (weeks: Set<string>) => {
  let count = 0
  let cursor = DateTime.now().startOf('week')
  if (!weeks.has(weekKey(cursor))) cursor = cursor.minus({ weeks: 1 })
  while (weeks.has(weekKey(cursor))) {
    count += 1
    cursor = cursor.minus({ weeks: 1 })
  }
  // cursor now points at the first week without a workout.
  return { count, firstMissingWeek: cursor }
}

const maxPages = 12

onMounted(async () => {
  if (!authStore.userId) return

  const weeks = new Set<string>()
  let oldestWeek: DateTime | undefined
  let pageToken = new Uint8Array(0)

  for (let page = 0; page < maxPages; page += 1) {
    const response = await listWorkouts([authStore.userId], pageToken)
    if (!response) break

    for (const workout of response.workouts) {
      if (!workout.finishedAt) continue
      const finished = DateTime.fromSeconds(Number(workout.finishedAt.seconds)).startOf('week')
      weeks.add(weekKey(finished))
      if (!oldestWeek || finished < oldestWeek) oldestWeek = finished
    }

    pageToken = response.pagination?.nextPageToken ?? new Uint8Array(0)
    if (!pageToken.length) break

    // Stop once the streak already breaks inside the fetched range: older
    // pages cannot change the outcome.
    const { firstMissingWeek } = computeStreak(weeks)
    if (oldestWeek && firstMissingWeek >= oldestWeek) break
  }

  streak.value = computeStreak(weeks).count
  thisWeekLogged.value = weeks.has(weekKey(DateTime.now().startOf('week')))
  loaded.value = true
})

const title = computed(() => (streak.value > 0 ? `${streak.value}-week streak` : 'Start a streak'))
const message = computed(() => {
  if (!streak.value) return 'Log one workout a week to build a streak.'
  return thisWeekLogged.value
    ? 'This week is in the bag. Keep it rolling next week.'
    : 'Log a workout this week to keep your streak alive.'
})
</script>

<template>
  <section v-if="loaded" class="streak-card" :class="{ active: streak > 0, safe: thisWeekLogged }">
    <span class="streak-icon"><FireIcon /></span>
    <div class="min-w-0">
      <strong>{{ title }}</strong>
      <small>{{ message }}</small>
    </div>
    <span v-if="streak > 0" class="streak-count">{{ streak }}</span>
  </section>
</template>

<style scoped>
.streak-card {
  @apply grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm;
}
.streak-icon {
  @apply grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-500;
}
.streak-card.active .streak-icon {
  @apply bg-amber-100 text-amber-600;
}
.streak-icon svg {
  @apply size-6;
}
.streak-card strong,
.streak-card small {
  @apply block truncate;
}
.streak-card strong {
  @apply text-sm font-semibold text-slate-950;
}
.streak-card small {
  @apply mt-0.5 whitespace-normal text-xs text-slate-500;
}
.streak-card.active:not(.safe) small {
  @apply font-medium text-amber-700;
}
.streak-count {
  @apply grid size-9 place-items-center rounded-full bg-amber-50 text-sm font-bold text-amber-700;
}
</style>
