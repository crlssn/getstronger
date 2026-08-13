<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PencilIcon, TrashIcon } from '@heroicons/vue/24/outline'

import { getPlan } from '@/http/requests'
import type { Plan } from '@/proto/api/v1/routine_service_pb'
import { useDashboardStore } from '@/stores/dashboard'
import { usePlanStore } from '@/stores/plans'

const route = useRoute()
const router = useRouter()
const planStore = usePlanStore()
const dashboardStore = useDashboardStore()
const plan = ref<Plan>()
const planId = route.params.id as string

onMounted(async () => {
  const response = await getPlan(planId)
  if (!response?.plan) return router.replace('/plans')
  plan.value = response.plan
})

const activate = async () => {
  if (!confirm('Make this plan active? Your current active plan will be paused.')) return
  const updated = await planStore.activate(planId)
  if (updated) {
    plan.value = updated
    await dashboardStore.load()
  }
}

const pause = async () => {
  if (!confirm('Pause this plan? Its current position will be saved.')) return
  if (await planStore.pause()) {
    if (plan.value) plan.value.active = false
    await dashboardStore.load()
  }
}

const remove = async () => {
  if (!confirm('Delete this plan? Your routines and workout history will stay intact.')) return
  if (await planStore.remove(planId)) await router.push('/plans')
}
</script>

<template>
  <div v-if="plan" class="plan-page">
    <section class="overview">
      <header>
        <p class="eyebrow">{{ plan.active ? 'Active plan' : 'Training plan' }}</p>
        <span v-if="plan.active">Active</span>
      </header>
      <h1>{{ plan.name }}</h1>
      <p>{{ plan.routines.length }} routines repeat continuously in this order.</p>
      <div class="overview-actions">
        <RouterLink :to="`/plans/${plan.id}/edit`"><PencilIcon /> Edit plan</RouterLink
        ><button v-if="plan.active" type="button" @click="pause">Pause</button
        ><button v-else type="button" @click="activate">Make active</button>
      </div>
    </section>
    <header class="order-heading">
      <p class="eyebrow">Routine order</p>
      <h2>Your repeating sequence</h2>
    </header>
    <ol class="routine-order">
      <li
        v-for="(routine, index) in plan.routines"
        :key="routine.id"
        :class="{ current: plan.active && index === plan.currentPosition }"
      >
        <span>{{ index + 1 }}</span>
        <div>
          <small>{{
            plan.active && index === plan.currentPosition ? 'UP NEXT' : `ROUTINE ${index + 1}`
          }}</small
          ><strong>{{ routine.name }}</strong
          ><small>{{ routine.exercises.length }} exercises</small>
        </div>
        <b v-if="plan.active && index === plan.currentPosition">Next</b>
      </li>
      <footer>
        After {{ plan.routines[plan.routines.length - 1]?.name }}, the sequence returns to
        {{ plan.routines[0]?.name }}.
      </footer>
    </ol>
    <button type="button" class="delete-plan" @click="remove"><TrashIcon /> Delete plan</button>
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.plan-page {
  @apply space-y-4;
}
.overview {
  @apply rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-6 text-white shadow-lg shadow-indigo-200;
}
.overview header {
  @apply flex items-center justify-between gap-3;
}
.eyebrow {
  @apply text-xs font-semibold uppercase tracking-wider text-slate-500;
}
.overview .eyebrow {
  @apply text-indigo-100;
}
.overview header span {
  @apply rounded-full border border-white/20 bg-white/15 px-3 py-1 text-xs font-semibold;
}
.overview h1 {
  @apply mt-3 text-2xl font-semibold tracking-tight;
}
.overview > p {
  @apply mt-2 text-sm text-indigo-100;
}
.overview-actions {
  @apply mt-5 flex flex-wrap gap-2;
}
.overview-actions a,
.overview-actions button {
  @apply inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold;
}
.overview-actions a {
  @apply bg-white text-indigo-700;
}
.overview-actions button {
  @apply border border-white/30 text-white;
}
.overview-actions svg {
  @apply size-4;
}
.order-heading {
  @apply px-1 pt-2;
}
.order-heading h2 {
  @apply mt-1 text-xl font-semibold tracking-tight;
}
.routine-order {
  @apply overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm;
}
.routine-order li {
  @apply grid min-h-20 grid-cols-[2.75rem_1fr_auto] items-center gap-3 border-t border-slate-100 p-4 first:border-t-0;
}
.routine-order li > span {
  @apply grid size-11 place-items-center rounded-xl bg-slate-100 font-semibold text-slate-600;
}
.routine-order li > div {
  @apply min-w-0;
}
.routine-order li strong,
.routine-order li small {
  @apply block truncate;
}
.routine-order li small {
  @apply mt-0.5 text-xs text-slate-500;
}
.routine-order li b {
  @apply text-sm font-semibold text-indigo-600;
}
.routine-order li.current {
  @apply bg-indigo-50;
}
.routine-order li.current > span {
  @apply bg-indigo-600 text-white;
}
.routine-order footer {
  @apply border-t border-slate-200 bg-slate-50 p-4 text-sm text-slate-600;
}
.delete-plan {
  @apply inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-red-600 hover:bg-red-50;
}
.delete-plan svg {
  @apply size-5;
}
</style>
