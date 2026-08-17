<script setup lang="ts">
import type { Exercise } from '@/proto/api/v1/shared_pb.ts'

import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useAlertStore } from '@/stores/alerts.ts'
import AppList from '@/ui/components/AppList.vue'
import AppButton from '@/ui/components/AppButton.vue'
import { getExercise, listExerciseTags, updateExercise } from '@/http/requests.ts'
import AppListItemInput from '@/ui/components/AppListItemInput.vue'
import ExerciseTagsInput from '@/ui/exercises/ExerciseTagsInput.vue'
import ExerciseMeasurementSettings from '@/ui/exercises/ExerciseMeasurementSettings.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
// Undefined until loaded: an empty object literal is truthy, so the form used
// to render with undefined metrics and crash before the fetch resolved.
const exercise = ref<Exercise>()
const loading = ref(true)
const tagSuggestions = ref<string[]>([])
const alertStore = useAlertStore()

onMounted(async () => {
  const [res, suggestions] = await Promise.all([
    getExercise(route.params.id as string),
    listExerciseTags(),
  ])
  tagSuggestions.value = suggestions
  if (res?.exercise) exercise.value = res.exercise
  loading.value = false
})

async function onUpdateExercise() {
  if (!exercise.value) return

  const res = await updateExercise(exercise.value)
  if (!res) return

  alertStore.setSuccess(t('exercise.form.updated'))
  await router.push(`/exercises/${exercise.value.id}`)
}
</script>

<template>
  <form v-if="exercise" @submit.prevent="onUpdateExercise">
    <h6>{{ t('exercise.name') }}</h6>
    <AppList>
      <AppListItemInput
        :model="exercise.name"
        type="text"
        required
        @update="(value: string) => exercise && (exercise.name = value)"
      />
    </AppList>

    <h6>{{ t('exercise.form.tracking') }}</h6>
    <ExerciseMeasurementSettings
      v-model:metrics="exercise.metrics"
      v-model:rest-seconds="exercise.restSeconds"
    />

    <h6>
      {{ t('exercise.form.tags') }} <small>{{ t('common.optional') }}</small>
    </h6>
    <ExerciseTagsInput v-model="exercise.tags" :suggestions="tagSuggestions" />

    <div class="form-actions">
      <AppButton type="submit" colour="primary">{{ t('exercise.update') }}</AppButton>
    </div>
  </form>

  <p v-else-if="loading" class="form-status">{{ t('common.loading') }}</p>

  <section v-else class="form-status">
    <h1>{{ t('exercise.unavailable') }}</h1>
    <RouterLink to="/exercises">{{ t('common.exercises') }}</RouterLink>
  </section>
</template>

<style scoped>
@reference '../../assets/base.css';

.form-status {
  @apply card p-6 text-sm text-text-subtle;
}
.form-status h1 {
  @apply text-title font-semibold text-text;
}
.form-status a {
  @apply mt-3 inline-flex min-h-(--size-control) items-center rounded-control bg-ink px-4 text-sm font-semibold text-white;
}
.form-actions {
  @apply mt-4;
}
input {
  @apply block w-full border-0 bg-white px-4 py-5 text-text shadow-card ring-1 ring-inset ring-ink-border placeholder:text-text-subtle focus:ring-2 focus:ring-inset focus:ring-ink;
}
</style>
