<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowPathIcon, CheckIcon, PlusIcon } from '@heroicons/vue/24/outline'

import { useConfirmationStore } from '@/stores/confirmation'
import { useDashboardStore } from '@/stores/dashboard'
import { usePlanStore } from '@/stores/plans'
import AppSkeleton from '@/ui/components/AppSkeleton.vue'
import TrainingTabs from '@/ui/components/TrainingTabs.vue'

const planStore = usePlanStore()
const { t } = useI18n()
const confirmationStore = useConfirmationStore()
const dashboardStore = useDashboardStore()
const plansLoaded = ref(false)

const activePlan = computed(() => planStore.activePlan)
const otherPlans = computed(() => planStore.plans.filter((plan) => !plan.active))
const nextRoutine = computed(() => {
  const plan = activePlan.value
  return plan?.routines[plan.currentPosition]
})
onMounted(async () => {
  await planStore.load()
  plansLoaded.value = true
})

const activate = async (id: string) => {
  if (activePlan.value) {
    const confirmed = await confirmationStore.confirm({
      body: t('training.activateConfirmBody'),
      confirmLabel: t('training.makeActive'),
      title: t('training.activateConfirmTitle'),
    })
    if (!confirmed) return
  }
  if (await planStore.activate(id)) await dashboardStore.load()
}

const pause = async () => {
  const confirmed = await confirmationStore.confirm({
    body: t('training.pauseConfirmBody'),
    confirmLabel: t('training.pause'),
    title: t('training.pauseConfirmTitle'),
  })
  if (!confirmed) return
  if (await planStore.pause()) await dashboardStore.load()
}
</script>

<template>
  <div class="plans-page">
    <header class="page-intro">
      <div>
        <h1>{{ t('training.heading') }}</h1>
      </div>
      <RouterLink v-if="planStore.plans.length" to="/plans/create"
        ><PlusIcon /> {{ t('training.newPlan') }}</RouterLink
      >
      <p>{{ t('training.plansDescription') }}</p>
    </header>

    <TrainingTabs />

    <AppSkeleton v-if="!plansLoaded" />

    <section v-else-if="!planStore.plans.length" class="empty-plan-state">
      <span class="empty-plan-icon"><ArrowPathIcon /></span>
      <p class="eyebrow">{{ t('training.howPlansWork') }}</p>
      <h2>{{ t('training.repeatingTitle') }}</h2>
      <p class="empty-plan-copy">
        {{ t('training.repeatingBody') }}
      </p>

      <ol class="plan-steps">
        <li>
          <span>1</span>
          <div>
            <strong>{{ t('training.chooseRoutines') }}</strong
            ><small>{{ t('training.chooseRoutinesBody') }}</small>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>{{ t('training.activatePlan') }}</strong
            ><small>{{ t('training.activatePlanBody') }}</small>
          </div>
        </li>
        <li>
          <span><CheckIcon /></span>
          <div>
            <strong>{{ t('training.keepTraining') }}</strong
            ><small>{{ t('training.keepTrainingBody') }}</small>
          </div>
        </li>
      </ol>

      <p class="active-plan-rule">
        {{ t('training.oneActive') }}
      </p>
      <RouterLink to="/plans/create" class="first-plan-button">
        <PlusIcon /> {{ t('training.createFirstPlan') }}
      </RouterLink>
    </section>

    <template v-else>
      <section v-if="activePlan" class="active-plan">
        <header>
          <p class="eyebrow">{{ t('training.activePlan') }}</p>
          <span>{{ t('training.active') }}</span>
        </header>
        <h2>{{ activePlan.name }}</h2>
        <p>{{ t('training.routineCountRepeats', { count: activePlan.routines.length }) }}</p>
        <div class="position-row">
          <span>{{ t('training.currentPosition') }}</span
          ><strong>{{
            t('training.routinePosition', {
              current: activePlan.currentPosition + 1,
              total: activePlan.routines.length,
            })
          }}</strong>
        </div>
        <div class="sequence" :aria-label="t('training.planPositionAria')">
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
            <small>{{ t('home.upNext') }}</small
            ><strong>{{ nextRoutine.name }}</strong
            ><small>{{ t('home.exerciseCount', { count: nextRoutine.exercises.length }) }}</small>
          </div>
        </div>
        <footer>
          <RouterLink :to="`/plans/${activePlan.id}`">{{ t('training.viewPlan') }}</RouterLink
          ><button type="button" @click="pause">{{ t('training.pause') }}</button>
        </footer>
      </section>

      <section v-else class="paused-note">
        <h2>{{ t('training.noActivePlan') }}</h2>
        <p>{{ t('training.noActivePlanBody') }}</p>
      </section>

      <section v-if="otherPlans.length" class="other-plans">
        <header>
          <p class="eyebrow">{{ t('training.yourPlans') }}</p>
          <h2>{{ activePlan ? t('training.otherPlans') : t('training.choosePlan') }}</h2>
        </header>
        <article v-for="plan in otherPlans" :key="plan.id">
          <RouterLink :to="`/plans/${plan.id}`"
            ><strong>{{ plan.name }}</strong
            ><small>{{
              t('training.routineCountSequence', { count: plan.routines.length })
            }}</small></RouterLink
          ><button type="button" @click="activate(plan.id)">
            {{ t('training.makeActive') }}
          </button>
        </article>
      </section>
    </template>
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.plans-page {
  @apply space-y-4;
}
.page-intro {
  @apply grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-1;
}
.eyebrow {
  @apply text-eyebrow font-bold uppercase text-text-subtle;
}
h1 {
  @apply mt-1 text-display font-bold text-text;
}
h2 {
  @apply text-title font-semibold text-text;
}
.page-intro > a {
  @apply inline-flex min-h-(--size-control) shrink-0 items-center gap-2 rounded-control bg-ink px-4 text-sm font-semibold text-white;
}
.page-intro svg {
  @apply size-5;
}
.page-intro > p {
  @apply col-span-2 max-w-none text-sm leading-6 text-text-subtle;
}
.active-plan,
.other-plans,
.routine-list,
.paused-note,
.empty-plan-state {
  @apply card p-5;
}
.empty-plan-state {
  @apply p-6;
}
.empty-plan-icon {
  @apply mb-5 grid size-12 place-items-center rounded-card bg-ink-tint text-ink-strong;
}
.empty-plan-icon svg {
  @apply size-6;
}
.empty-plan-state h2 {
  @apply mt-2;
}
.empty-plan-copy {
  @apply mt-2 text-sm leading-6 text-text-muted;
}
.plan-steps {
  @apply mt-6 divide-y divide-border border-y border-border;
}
.plan-steps li {
  @apply flex items-center gap-3 py-4;
}
.plan-steps li > span {
  @apply grid size-9 shrink-0 place-items-center rounded-control bg-ink-surface text-sm font-semibold text-ink-strong;
}
.plan-steps li > span svg {
  @apply size-4;
}
.plan-steps strong,
.plan-steps small {
  @apply block;
}
.plan-steps strong {
  @apply text-sm font-semibold text-text;
}
.plan-steps small {
  @apply mt-0.5 text-xs text-text-subtle;
}
.active-plan-rule {
  @apply mt-5 text-xs leading-5 text-text-subtle;
}
.first-plan-button {
  @apply mt-5 inline-flex min-h-(--size-control) w-full items-center justify-center gap-2 rounded-control bg-ink px-4 text-sm font-semibold text-white hover:bg-ink-strong;
}
.first-plan-button svg {
  @apply size-5;
}
.active-plan > header {
  @apply flex items-center justify-between gap-3;
}
.active-plan > header span {
  @apply rounded-full bg-success-surface px-3 py-1 text-xs font-semibold text-success;
}
.active-plan > h2 {
  @apply mt-3;
}
.active-plan > p {
  @apply mt-1 text-sm text-text-subtle;
}
.position-row {
  @apply mt-5 flex justify-between gap-3 text-sm text-text-subtle;
}
.position-row strong {
  @apply text-text-muted;
}
.sequence {
  @apply mt-3 flex flex-wrap gap-2;
}
.sequence span {
  @apply grid size-9 place-items-center rounded-control bg-info-surface text-sm font-semibold text-text-muted;
}
.sequence span.done {
  @apply bg-success-surface text-success;
}
.sequence span.current {
  @apply bg-ink text-white;
}
.next-row {
  @apply mt-4 rounded-control bg-ink-surface p-4;
}
.next-row div {
  @apply grid gap-1;
}
.next-row small {
  @apply text-xs text-ink;
}
.active-plan footer {
  @apply mt-4 flex gap-2 border-t border-border pt-4;
}
.active-plan footer a,
.active-plan footer button {
  @apply min-h-(--size-control-sm) rounded-control px-4 text-sm font-semibold;
}
.active-plan footer a {
  @apply inline-flex items-center bg-ink text-white;
}
.active-plan footer button {
  @apply border border-border text-text-muted;
}
.paused-note p {
  @apply mt-1 text-sm text-text-subtle;
}
.other-plans > header {
  @apply mb-2;
}
.other-plans article {
  @apply flex min-h-16 items-center justify-between gap-3 border-t border-border;
}
.other-plans article a {
  @apply min-w-0;
}
.other-plans article strong,
.other-plans article small {
  @apply block truncate;
}
.other-plans article small {
  @apply mt-1 text-xs text-text-subtle;
}
.other-plans article button {
  @apply shrink-0 text-sm font-semibold text-ink;
}
.routine-list strong,
.routine-empty h2 {
  @apply text-title font-semibold text-text;
}
.routine-empty p {
  @apply mt-1;
}
</style>
