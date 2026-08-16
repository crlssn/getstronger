<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsUpDownIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'

import { getPlan, listRoutines } from '@/http/requests'
import type { Routine } from '@/proto/api/v1/routine_service_pb'
import { useAlertStore } from '@/stores/alerts'
import { usePlanStore } from '@/stores/plans'

const props = defineProps<{ planId?: string }>()
const { t } = useI18n()
const router = useRouter()
const planStore = usePlanStore()
const alertStore = useAlertStore()
const name = ref('')
const routines = ref<Routine[]>([])
const selected = ref<Routine[]>([])
const loading = ref(true)
const saving = ref(false)
const pickerOpen = ref(false)

const editing = computed(() => Boolean(props.planId))
const available = computed(() => {
  const selectedIds = new Set(selected.value.map((routine) => routine.id))
  return routines.value.filter((routine) => !selectedIds.has(routine.id))
})
const canSave = computed(() => name.value.trim().length > 0 && selected.value.length > 0)

onMounted(async () => {
  const routinesResponse = await listRoutines(new Uint8Array(0))
  routines.value = routinesResponse?.routines ?? []

  if (props.planId) {
    const response = await getPlan(props.planId)
    if (!response?.plan) {
      await router.replace('/plans')
      return
    }
    name.value = response.plan.name
    selected.value = [...response.plan.routines]
  }
  loading.value = false
})

const addRoutine = (routine: Routine) => {
  selected.value.push(routine)
  pickerOpen.value = false
}

const removeRoutine = (index: number) => selected.value.splice(index, 1)

const moveRoutine = async (index: number, direction: -1 | 1) => {
  const target = index + direction
  if (target < 0 || target >= selected.value.length) return
  const [routine] = selected.value.splice(index, 1)
  selected.value.splice(target, 0, routine)
  await nextTick()
}

const save = async () => {
  if (!canSave.value || saving.value) return
  saving.value = true
  const routineIds = selected.value.map((routine) => routine.id)
  const plan = props.planId
    ? await planStore.update(props.planId, name.value.trim(), routineIds)
    : await planStore.create(name.value.trim(), routineIds)
  saving.value = false
  if (!plan) return

  alertStore.setSuccess(
    editing.value ? t('training.planForm.updated') : t('training.planForm.created'),
  )
  await router.push(`/plans/${plan.id}`)
}
</script>

<template>
  <form class="builder-page" @submit.prevent="save">
    <header class="page-intro">
      <p class="eyebrow">{{ t('training.planForm.eyebrow') }}</p>
      <h1>{{ editing ? t('training.planForm.editTitle') : t('training.newPlan') }}</h1>
      <p>{{ t('training.planForm.intro') }}</p>
    </header>

    <div v-if="loading" class="loading-card">{{ t('training.planForm.loading') }}</div>
    <template v-else>
      <label class="name-field">
        <span>{{ t('training.planForm.name') }}</span>
        <input v-model="name" type="text" :placeholder="t('training.planForm.namePlaceholder')" />
      </label>

      <div class="loop-note">
        <ArrowsUpDownIcon />
        <span>{{ t('training.planForm.loopNote') }}</span>
      </div>
      <div v-if="editing" class="edit-note">
        {{ t('training.planForm.editNote') }}
      </div>

      <section class="routine-order">
        <header>
          <div>
            <p class="eyebrow">{{ t('training.planForm.orderEyebrow') }}</p>
            <h2>{{ t('common.routines') }}</h2>
          </div>
          <span>{{ t('training.planForm.routineCount', selected.length) }}</span>
        </header>

        <div v-if="!selected.length" class="empty-order">
          <strong>{{ t('training.planForm.emptyTitle') }}</strong>
          <p>{{ t('training.planForm.emptyBody') }}</p>
        </div>
        <ol v-else>
          <li v-for="(routine, index) in selected" :key="routine.id">
            <span class="position">{{ index + 1 }}</span>
            <div class="routine-copy">
              <strong>{{ routine.name }}</strong>
              <small>{{ t('home.exerciseCount', routine.exercises.length) }}</small>
            </div>
            <div class="order-actions">
              <button
                type="button"
                :disabled="index === 0"
                :aria-label="t('training.planForm.moveUp', { name: routine.name })"
                @click="moveRoutine(index, -1)"
              >
                <ArrowUpIcon />
              </button>
              <button
                type="button"
                :disabled="index === selected.length - 1"
                :aria-label="t('training.planForm.moveDown', { name: routine.name })"
                @click="moveRoutine(index, 1)"
              >
                <ArrowDownIcon />
              </button>
              <button
                type="button"
                :aria-label="t('training.planForm.remove', { name: routine.name })"
                @click="removeRoutine(index)"
              >
                <TrashIcon />
              </button>
            </div>
          </li>
        </ol>

        <button type="button" class="add-routine" @click="pickerOpen = true">
          <PlusIcon /> {{ t('training.planForm.addRoutine') }}
        </button>
        <footer v-if="selected.length">
          {{
            t('training.planForm.loopFooter', {
              last: selected[selected.length - 1]?.name,
              first: selected[0]?.name,
            })
          }}
        </footer>
      </section>

      <div class="save-area">
        <small>{{
          editing ? t('training.planForm.saveNoteEditing') : t('training.planForm.saveNoteNew')
        }}</small>
        <button type="submit" :disabled="!canSave || saving">
          {{
            saving
              ? t('training.planForm.saving')
              : editing
                ? t('training.planForm.saveChanges')
                : t('training.planForm.createPlan')
          }}
        </button>
      </div>
    </template>
  </form>

  <div v-if="pickerOpen" class="picker-backdrop" @click.self="pickerOpen = false">
    <section
      class="routine-picker"
      role="dialog"
      aria-modal="true"
      aria-labelledby="routine-picker-title"
    >
      <header>
        <div>
          <p class="eyebrow">{{ t('training.planForm.pickerEyebrow') }}</p>
          <h2 id="routine-picker-title">{{ t('training.planForm.pickerTitle') }}</h2>
        </div>
        <button type="button" :aria-label="t('home.closePicker')" @click="pickerOpen = false">
          <XMarkIcon />
        </button>
      </header>
      <div v-if="available.length" class="routine-options">
        <button
          v-for="routine in available"
          :key="routine.id"
          type="button"
          @click="addRoutine(routine)"
        >
          <span
            ><strong>{{ routine.name }}</strong
            ><small>{{ t('home.exerciseCount', routine.exercises.length) }}</small></span
          ><PlusIcon />
        </button>
      </div>
      <p v-else class="picker-empty">{{ t('training.planForm.pickerEmpty') }}</p>
    </section>
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.builder-page {
  @apply space-y-5;
}
.page-intro {
  @apply px-1;
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
.page-intro > p:last-child {
  @apply mt-2 text-sm text-slate-500;
}
.loading-card,
.name-field input,
.routine-order {
  @apply card;
}
.loading-card {
  @apply p-5 text-sm text-slate-500;
}
.name-field {
  @apply grid gap-2 text-sm font-semibold text-slate-600;
}
.name-field input {
  @apply min-h-(--size-control) px-4 text-slate-950 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-indigo-500;
}
.loop-note,
.edit-note {
  @apply flex gap-3 rounded-2xl border p-4 text-sm;
}
.loop-note {
  @apply border-indigo-200 bg-indigo-50 text-indigo-700;
}
.loop-note svg {
  @apply mt-0.5 size-5 shrink-0;
}
.edit-note {
  @apply border-emerald-200 bg-emerald-50 text-emerald-700;
}
.routine-order {
  @apply overflow-hidden;
}
.routine-order > header {
  @apply flex items-end justify-between gap-3 p-5;
}
.routine-order > header > span {
  @apply text-sm text-slate-500;
}
.empty-order {
  @apply border-t border-slate-100 p-6 text-center;
}
.empty-order p {
  @apply mt-1 text-sm text-slate-500;
}
.routine-order ol {
  @apply divide-y divide-slate-100 border-t border-slate-100;
}
.routine-order li {
  @apply grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 p-4;
}
.position {
  @apply grid size-9 place-items-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-600;
}
.routine-copy {
  @apply min-w-0;
}
.routine-copy strong,
.routine-copy small {
  @apply block truncate;
}
.routine-copy small {
  @apply mt-1 text-xs text-slate-500;
}
.order-actions {
  @apply flex;
}
.order-actions button {
  @apply grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-25;
}
.order-actions button:last-child {
  @apply hover:text-red-600;
}
.order-actions svg {
  @apply size-4;
}
.add-routine {
  @apply m-4 flex min-h-(--size-control) w-[calc(100%_-_2rem)] items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-300 bg-indigo-50 text-sm font-semibold text-indigo-700;
}
.add-routine svg {
  @apply size-5;
}
.routine-order > footer {
  @apply border-t border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600;
}
.save-area {
  @apply grid gap-3;
}
.save-area small {
  @apply text-center text-xs text-slate-500;
}
.save-area button {
  @apply min-h-(--size-control) rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white disabled:bg-indigo-100 disabled:text-slate-400;
}
.picker-backdrop {
  @apply fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-6;
}
.routine-picker {
  @apply w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl;
}
.routine-picker > header {
  @apply mb-4 flex items-center justify-between gap-3;
}
.routine-picker > header button {
  @apply grid size-11 place-items-center rounded-xl border border-slate-200 text-slate-500;
}
.routine-picker > header svg {
  @apply size-5;
}
.routine-options {
  @apply divide-y divide-slate-100 border-y border-slate-100;
}
.routine-options button {
  @apply flex min-h-16 w-full items-center justify-between gap-3 text-left;
}
.routine-options button span {
  @apply min-w-0;
}
.routine-options strong,
.routine-options small {
  @apply block truncate;
}
.routine-options small {
  @apply mt-1 text-xs text-slate-500;
}
.routine-options svg {
  @apply size-5 shrink-0 text-indigo-600;
}
.picker-empty {
  @apply py-6 text-center text-sm text-slate-500;
}
</style>
