<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ArrowPathIcon,
  CheckIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from '@heroicons/vue/24/outline'

import { listRoutines } from '@/http/requests'
import type { Routine } from '@/proto/api/v1/routine_service_pb'
import { useDashboardStore } from '@/stores/dashboard'
import { usePlanStore } from '@/stores/plans'

const planStore = usePlanStore()
const dashboardStore = useDashboardStore()
const routines = ref<Routine[]>([])
const tab = ref<'plans' | 'routines'>('plans')
const plansLoaded = ref(false)
const routineSearch = ref('')

const activePlan = computed(() => planStore.activePlan)
const otherPlans = computed(() => planStore.plans.filter((plan) => !plan.active))
const nextRoutine = computed(() => {
  const plan = activePlan.value
  return plan?.routines[plan.currentPosition]
})
const filteredRoutines = computed(() => {
  const query = routineSearch.value.trim().toLowerCase()
  if (!query) return routines.value
  return routines.value.filter((routine) =>
    [routine.name, ...routine.exercises.map((exercise) => exercise.name)]
      .join(' ')
      .toLowerCase()
      .includes(query),
  )
})

onMounted(async () => {
  const [, response] = await Promise.all([planStore.load(), listRoutines(new Uint8Array(0))])
  routines.value = response?.routines ?? []
  plansLoaded.value = true
})

const activate = async (id: string) => {
  if (
    activePlan.value &&
    !confirm('Your current plan will be paused with its position saved. Make this plan active?')
  )
    return
  if (await planStore.activate(id)) await dashboardStore.load()
}

const pause = async () => {
  if (!confirm('Pause this plan? Its current position will be saved.')) return
  if (await planStore.pause()) await dashboardStore.load()
}
</script>

<template>
  <div class="plans-page">
    <header class="page-intro">
      <div>
        <p class="eyebrow">Plans and routines</p>
        <h1>Training</h1>
      </div>
      <RouterLink v-if="tab === 'plans' && planStore.plans.length" to="/plans/create"
        ><PlusIcon /> New plan</RouterLink
      >
      <RouterLink v-else-if="tab === 'routines'" to="/routines/create"
        ><PlusIcon /> New routine</RouterLink
      >
      <p>
        {{
          tab === 'plans'
            ? 'Put routines in order and repeat them continuously—no schedule or end date.'
            : 'Create reusable workout templates from your exercises.'
        }}
      </p>
    </header>

    <div class="tabs" role="tablist" aria-label="Plans view">
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'plans'"
        :tabindex="tab === 'plans' ? 0 : -1"
        :class="{ active: tab === 'plans' }"
        @click="tab = 'plans'"
      >
        Plans
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'routines'"
        :tabindex="tab === 'routines' ? 0 : -1"
        :class="{ active: tab === 'routines' }"
        @click="tab = 'routines'"
      >
        Routines
      </button>
    </div>

    <template v-if="tab === 'plans'">
      <section v-if="!plansLoaded" class="plan-loading" aria-live="polite">
        <span></span><span></span><span></span>
      </section>

      <section v-else-if="!planStore.plans.length" class="empty-plan-state">
        <span class="empty-plan-icon"><ArrowPathIcon /></span>
        <p class="eyebrow">How plans work</p>
        <h2>Turn routines into a repeating sequence</h2>
        <p class="empty-plan-copy">
          A plan works through your chosen routines in order, then starts again from the beginning.
        </p>

        <ol class="plan-steps">
          <li>
            <span>1</span>
            <div><strong>Choose routines</strong><small>Add them in any order.</small></div>
          </li>
          <li>
            <span>2</span>
            <div><strong>Activate the plan</strong><small>It controls what is Up Next.</small></div>
          </li>
          <li>
            <span><CheckIcon /></span>
            <div>
              <strong>Keep training</strong><small>The sequence repeats until paused.</small>
            </div>
          </li>
        </ol>

        <p class="active-plan-rule">
          You can have one active plan at a time. Plans are optional and can be paused whenever you
          like.
        </p>
        <RouterLink to="/plans/create" class="first-plan-button">
          <PlusIcon /> Create your first plan
        </RouterLink>
      </section>

      <template v-else>
        <section v-if="activePlan" class="active-plan">
          <header>
            <p class="eyebrow">Active plan</p>
            <span>Active</span>
          </header>
          <h2>{{ activePlan.name }}</h2>
          <p>{{ activePlan.routines.length }} routines · repeats continuously</p>
          <div class="position-row">
            <span>Current position</span
            ><strong
              >Routine {{ activePlan.currentPosition + 1 }} of
              {{ activePlan.routines.length }}</strong
            >
          </div>
          <div class="sequence" aria-label="Current plan position">
            <span
              v-for="(_, index) in activePlan.routines"
              :key="index"
              :class="{
                current: index === activePlan.currentPosition,
                done: index < activePlan.currentPosition,
              }"
              >{{ index + 1 }}</span
            >
          </div>
          <div v-if="nextRoutine" class="next-row">
            <div>
              <small>UP NEXT</small><strong>{{ nextRoutine.name }}</strong
              ><small>{{ nextRoutine.exercises.length }} exercises</small>
            </div>
          </div>
          <footer>
            <RouterLink :to="`/plans/${activePlan.id}`">View plan</RouterLink
            ><button type="button" @click="pause">Pause</button>
          </footer>
        </section>

        <section v-else class="paused-note">
          <h2>No active plan</h2>
          <p>Start any routine manually, or activate a plan below.</p>
        </section>

        <section v-if="otherPlans.length" class="other-plans">
          <header>
            <p class="eyebrow">Your plans</p>
            <h2>{{ activePlan ? 'Other plans' : 'Choose a plan' }}</h2>
          </header>
          <article v-for="plan in otherPlans" :key="plan.id">
            <RouterLink :to="`/plans/${plan.id}`"
              ><strong>{{ plan.name }}</strong
              ><small>{{ plan.routines.length }} routines · repeating sequence</small></RouterLink
            ><button type="button" @click="activate(plan.id)">Make active</button>
          </article>
        </section>
      </template>
    </template>

    <template v-else>
      <label class="search-field">
        <MagnifyingGlassIcon />
        <input
          v-model="routineSearch"
          type="search"
          placeholder="Search routines"
          aria-label="Search routines"
        />
      </label>

      <section v-if="filteredRoutines.length" class="routine-list">
        <header>
          <h2>Your routines</h2>
        </header>
        <RouterLink
          v-for="routine in filteredRoutines"
          :key="routine.id"
          :to="`/routines/${routine.id}`"
          ><span
            ><strong>{{ routine.name }}</strong
            ><small>{{ routine.exercises.length }} exercises</small></span
          ><ChevronRightIcon
        /></RouterLink>
      </section>

      <section v-else class="routine-empty">
        <h2>{{ routineSearch ? 'No matching routines' : 'No routines yet' }}</h2>
        <p>
          {{
            routineSearch
              ? 'Try another search.'
              : 'Create your first workout template to use in a plan.'
          }}
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.plans-page {
  @apply space-y-4;
}
.page-intro {
  @apply grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-1;
}
.eyebrow {
  @apply text-xs font-semibold uppercase tracking-wider text-slate-500;
}
h1 {
  @apply mt-1 text-2xl font-semibold tracking-tight text-slate-950;
}
h2 {
  @apply text-xl font-semibold tracking-tight text-slate-950;
}
.page-intro > a {
  @apply inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white;
}
.page-intro svg {
  @apply size-5;
}
.page-intro > p {
  @apply col-span-2 max-w-none text-sm leading-6 text-slate-500;
}
.tabs {
  @apply grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-1;
}
.tabs button {
  @apply min-h-11 rounded-xl text-sm font-semibold text-slate-500;
}
.tabs button.active {
  @apply bg-indigo-50 text-indigo-700;
}
.search-field {
  @apply flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm;
}
.search-field svg {
  @apply size-5 text-slate-400;
}
.search-field input {
  @apply h-12 w-full border-0 bg-transparent p-0 text-sm placeholder:text-slate-400 focus:ring-0;
}
.active-plan,
.other-plans,
.routine-list,
.paused-note,
.empty-plan-state,
.plan-loading {
  @apply rounded-2xl border border-slate-200 bg-white p-5 shadow-sm;
}
.plan-loading {
  @apply space-y-3;
}
.plan-loading span {
  @apply block h-4 animate-pulse rounded-full bg-slate-100;
}
.plan-loading span:first-child {
  @apply h-12 w-12 rounded-2xl;
}
.plan-loading span:nth-child(2) {
  @apply w-2/3;
}
.empty-plan-state {
  @apply p-6;
}
.empty-plan-icon {
  @apply mb-5 grid size-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600;
}
.empty-plan-icon svg {
  @apply size-6;
}
.empty-plan-state h2 {
  @apply mt-2 text-2xl;
}
.empty-plan-copy {
  @apply mt-2 text-sm leading-6 text-slate-600;
}
.plan-steps {
  @apply mt-6 divide-y divide-slate-100 border-y border-slate-100;
}
.plan-steps li {
  @apply flex items-center gap-3 py-4;
}
.plan-steps li > span {
  @apply grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-sm font-semibold text-indigo-700;
}
.plan-steps li > span svg {
  @apply size-4;
}
.plan-steps strong,
.plan-steps small {
  @apply block;
}
.plan-steps strong {
  @apply text-sm font-semibold text-slate-900;
}
.plan-steps small {
  @apply mt-0.5 text-xs text-slate-500;
}
.active-plan-rule {
  @apply mt-5 text-xs leading-5 text-slate-500;
}
.first-plan-button {
  @apply mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700;
}
.first-plan-button svg {
  @apply size-5;
}
.active-plan > header {
  @apply flex items-center justify-between gap-3;
}
.active-plan > header span {
  @apply rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700;
}
.active-plan > h2 {
  @apply mt-3;
}
.active-plan > p {
  @apply mt-1 text-sm text-slate-500;
}
.position-row {
  @apply mt-5 flex justify-between gap-3 text-sm text-slate-500;
}
.position-row strong {
  @apply text-slate-700;
}
.sequence {
  @apply mt-3 flex flex-wrap gap-2;
}
.sequence span {
  @apply grid size-9 place-items-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-500;
}
.sequence span.done {
  @apply bg-emerald-50 text-emerald-700;
}
.sequence span.current {
  @apply bg-indigo-600 text-white;
}
.next-row {
  @apply mt-4 rounded-xl bg-indigo-50 p-4;
}
.next-row div {
  @apply grid gap-1;
}
.next-row small {
  @apply text-xs text-indigo-600;
}
.active-plan footer {
  @apply mt-4 flex gap-2 border-t border-slate-100 pt-4;
}
.active-plan footer a,
.active-plan footer button {
  @apply min-h-10 rounded-xl px-4 text-sm font-semibold;
}
.active-plan footer a {
  @apply inline-flex items-center bg-indigo-600 text-white;
}
.active-plan footer button {
  @apply border border-slate-200 text-slate-600;
}
.paused-note p {
  @apply mt-1 text-sm text-slate-500;
}
.other-plans > header {
  @apply mb-2;
}
.other-plans article {
  @apply flex min-h-16 items-center justify-between gap-3 border-t border-slate-100;
}
.other-plans article a {
  @apply min-w-0;
}
.other-plans article strong,
.other-plans article small {
  @apply block truncate;
}
.other-plans article small {
  @apply mt-1 text-xs text-slate-500;
}
.other-plans article button {
  @apply shrink-0 text-sm font-semibold text-indigo-600;
}
.routine-list > header {
  @apply mb-2;
}
.routine-list > header h2 {
  @apply text-lg;
}
.routine-list > a {
  @apply flex min-h-16 items-center justify-between gap-3 border-t border-slate-100 py-3 transition hover:text-indigo-700;
}
.routine-list > a span {
  @apply min-w-0;
}
.routine-list strong,
.routine-list small {
  @apply block truncate;
}
.routine-list small {
  @apply mt-1 text-xs text-slate-500;
}
.routine-list > a > svg {
  @apply size-5 shrink-0 text-slate-400;
}
.routine-empty {
  @apply rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500;
}
.routine-empty h2 {
  @apply text-lg font-semibold text-slate-900;
}
.routine-empty p {
  @apply mt-1;
}
</style>
