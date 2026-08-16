<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { PencilIcon, TrashIcon } from '@heroicons/vue/24/outline'

import { getPlan } from '@/http/requests'
import type { Plan } from '@/proto/api/v1/routine_service_pb'
import { useDashboardStore } from '@/stores/dashboard'
import { usePageTitleStore } from '@/stores/pageTitle'
import { usePlanStore } from '@/stores/plans'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const planStore = usePlanStore()
const dashboardStore = useDashboardStore()
const pageTitleStore = usePageTitleStore()
const plan = ref<Plan>()
const planId = route.params.id as string

onMounted(async () => {
  const response = await getPlan(planId)
  if (!response?.plan) return router.replace('/plans')
  plan.value = response.plan
  pageTitleStore.setPageTitle(response.plan.name)
})

const activate = async () => {
  if (!confirm(t('training.activateConfirm'))) return
  const updated = await planStore.activate(planId)
  if (updated) {
    plan.value = updated
    await dashboardStore.load()
  }
}

const pause = async () => {
  if (!confirm(t('training.pauseConfirm'))) return
  if (await planStore.pause()) {
    if (plan.value) plan.value.active = false
    await dashboardStore.load()
  }
}

const remove = async () => {
  if (!confirm(t('training.planView.deleteConfirm'))) return
  if (await planStore.remove(planId)) await router.push('/plans')
}
</script>

<template>
  <div v-if="plan" class="plan-page">
    <section class="overview">
      <header>
        <p class="eyebrow">
          {{ plan.active ? t('training.activePlan') : t('training.planView.trainingPlan') }}
        </p>
        <span v-if="plan.active">{{ t('training.active') }}</span>
      </header>
      <p>{{ t('training.planView.routinesRepeat', plan.routines.length) }}</p>
      <div class="overview-actions">
        <RouterLink :to="`/plans/${plan.id}/edit`"
          ><PencilIcon /> {{ t('training.planForm.editTitle') }}</RouterLink
        ><button v-if="plan.active" type="button" @click="pause">{{ t('training.pause') }}</button
        ><button v-else type="button" @click="activate">{{ t('training.makeActive') }}</button>
      </div>
    </section>
    <header class="order-heading">
      <p class="eyebrow">{{ t('training.planView.orderEyebrow') }}</p>
      <h2>{{ t('training.planView.orderTitle') }}</h2>
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
            plan.active && index === plan.currentPosition
              ? t('training.planView.upNextTag')
              : t('training.planView.routineTag', { number: index + 1 })
          }}</small
          ><strong>{{ routine.name }}</strong
          ><small>{{ t('home.exerciseCount', routine.exercises.length) }}</small>
        </div>
        <b v-if="plan.active && index === plan.currentPosition">{{ t('common.next') }}</b>
      </li>
      <footer>
        {{
          t('training.planForm.loopFooter', {
            last: plan.routines[plan.routines.length - 1]?.name,
            first: plan.routines[0]?.name,
          })
        }}
      </footer>
    </ol>
    <button type="button" class="delete-plan" @click="remove">
      <TrashIcon /> {{ t('training.planView.delete') }}
    </button>
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.plan-page {
  @apply space-y-4;
}
/* An ordinary card: the inverse surface is reserved for the single next action
   on a screen, and this is a page header. */
.overview {
  @apply card p-6;
}
.overview header {
  @apply flex items-center justify-between gap-3;
}
.eyebrow {
  @apply text-xs font-semibold uppercase tracking-wider text-slate-500;
}
.overview .eyebrow {
  @apply text-text-subtle;
}
.overview header span {
  @apply rounded-full bg-success-surface px-3 py-1 text-xs font-semibold text-success;
}
.overview > p {
  @apply mt-2 text-sm text-text-muted;
}
.overview-actions {
  @apply mt-5 flex flex-wrap gap-2;
}
.overview-actions a,
.overview-actions button {
  @apply inline-flex min-h-(--size-control) items-center gap-2 rounded-xl px-4 text-sm font-semibold;
}
.overview-actions a {
  @apply bg-ink text-white transition hover:brightness-125;
}
.overview-actions button {
  @apply border border-border text-text-muted transition hover:bg-surface-sunken hover:text-text;
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
  @apply card overflow-hidden;
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
  @apply inline-flex min-h-(--size-control-sm) items-center gap-2 rounded-xl px-4 text-sm font-semibold text-red-600 hover:bg-red-50;
}
.delete-plan svg {
  @apply size-5;
}
</style>
