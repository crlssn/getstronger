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
} from '@heroicons/vue/24/outline'

import { getPlan, listRoutines } from '@/http/requests'
import type { Routine } from '@/proto/api/v1/routine_service_pb'
import AppOptionalAction from '@/ui/components/AppOptionalAction.vue'
import AppSheet from '@/ui/components/AppSheet.vue'
import AppSkeleton from '@/ui/components/AppSkeleton.vue'
import { useAlertStore } from '@/stores/alerts'
import { usePlanStore } from '@/stores/plans'
import posthog from '@/posthog'

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

  posthog.capture(editing.value ? 'plan_updated' : 'plan_created')
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
      <p>{{ t('training.planForm.intro') }}</p>
    </header>

    <AppSkeleton v-if="loading" />
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

        <div class="add-routine">
          <AppOptionalAction
            :label="t('training.planForm.addRoutine')"
            @click="pickerOpen = true"
          />
        </div>
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

  <AppSheet
    v-if="pickerOpen"
    :eyebrow="t('training.planForm.pickerEyebrow')"
    :title="t('training.planForm.pickerTitle')"
    :close-label="t('home.closePicker')"
    @close="pickerOpen = false"
  >
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
  </AppSheet>
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
  @apply text-eyebrow font-bold uppercase text-text-subtle;
}
h2 {
  @apply text-title font-semibold text-text;
}
.page-intro > p:last-child {
  @apply mt-2 text-sm text-text-subtle;
}
.name-field input,
.routine-order {
  @apply card;
}
.name-field {
  @apply grid gap-2 text-sm font-semibold text-text-muted;
}
.name-field input {
  @apply min-h-(--size-control) px-4 text-text placeholder:text-text-subtle focus:border-ink-muted focus:ring-ink-muted;
}
.loop-note,
.edit-note {
  @apply flex gap-3 rounded-card border p-4 text-sm;
}
.loop-note {
  @apply border-ink-border bg-ink-surface text-ink-strong;
}
.loop-note svg {
  @apply mt-0.5 size-5 shrink-0;
}
.edit-note {
  @apply border-success/30 bg-success-surface text-success;
}
.routine-order {
  @apply overflow-hidden;
}
.routine-order > header {
  @apply flex items-end justify-between gap-3 p-5;
}
.routine-order > header > span {
  @apply text-sm text-text-subtle;
}
.empty-order {
  @apply border-t border-border p-6 text-center;
}
.empty-order p {
  @apply mt-1 text-sm text-text-subtle;
}
.routine-order ol {
  @apply divide-y divide-border border-t border-border;
}
.routine-order li {
  @apply grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 p-4;
}
.position {
  @apply grid size-9 place-items-center rounded-control bg-ink-tint text-sm font-semibold text-text-muted;
}
.routine-copy {
  @apply min-w-0;
}
.routine-copy strong,
.routine-copy small {
  @apply block truncate;
}
.routine-copy small {
  @apply mt-1 text-xs text-text-subtle;
}
.order-actions {
  @apply flex;
}
/* Three targets in a row, so they take the floor in width as well as height —
   no negative margin sideways, which would overlap the neighbour it shares an
   edge with. The vertical one keeps the row its height. */
.order-actions button {
  @apply -my-1 grid size-11 place-items-center rounded-lg text-text-subtle hover:bg-ink-tint hover:text-ink disabled:opacity-25;
}
.order-actions button:last-child {
  @apply hover:text-danger;
}
.order-actions svg {
  @apply size-4;
}
/* Kept inside the card frame; the look itself comes from AppOptionalAction. */
.add-routine {
  @apply p-4;
}
.routine-order > footer {
  @apply border-t border-border bg-ink-surface px-5 py-4 text-sm text-text-muted;
}
.save-area {
  @apply grid gap-3;
}
.save-area small {
  @apply text-center text-xs text-text-subtle;
}
.save-area button {
  @apply min-h-(--size-control) rounded-control bg-ink px-5 text-sm font-semibold text-white disabled:bg-ink-tint disabled:text-text-subtle;
}
.routine-options {
  @apply divide-y divide-border border-y border-border;
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
  @apply mt-1 text-xs text-text-subtle;
}
.routine-options svg {
  @apply size-5 shrink-0 text-ink;
}
.picker-empty {
  @apply py-6 text-center text-sm text-text-subtle;
}
</style>
