<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAlertStore } from '@/stores/alerts'
import { createExercise, listExerciseTags } from '@/http/requests'
import AppList from '@/ui/components/AppList.vue'
import AppListItemInput from '@/ui/components/AppListItemInput.vue'
import { type CreateExerciseRequest } from '@/proto/api/v1/exercise_service_pb'
import AppButton from '@/ui/components/AppButton.vue'
import ExerciseTagsInput from '@/ui/exercises/ExerciseTagsInput.vue'
import ExerciseMeasurementSettings from '@/ui/exercises/ExerciseMeasurementSettings.vue'
import { ExerciseMetric } from '@/proto/api/v1/shared_pb'

const { t } = useI18n()
const router = useRouter()
const alertStore = useAlertStore()
const tagSuggestions = ref<string[]>([])

const req = ref<CreateExerciseRequest>({
  $typeName: 'api.v1.CreateExerciseRequest',
  name: '',
  tags: [],
  metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
  restSeconds: 90,
})

onMounted(async () => {
  tagSuggestions.value = await listExerciseTags()
})

const onSubmit = async () => {
  const res = await createExercise(req.value)
  if (!res) return
  alertStore.setSuccess(t('exercise.form.created'))
  await router.push('/exercises')
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <h6>{{ t('exercise.name') }}</h6>
    <AppList>
      <AppListItemInput :model="req.name" type="text" required @update="(n) => (req.name = n)" />
    </AppList>

    <h6>{{ t('exercise.form.tracking') }}</h6>
    <ExerciseMeasurementSettings
      v-model:metrics="req.metrics"
      v-model:rest-seconds="req.restSeconds"
    />

    <h6>
      {{ t('exercise.form.tags') }} <small>{{ t('common.optional') }}</small>
    </h6>
    <ExerciseTagsInput v-model="req.tags" :suggestions="tagSuggestions" />

    <div class="form-actions">
      <AppButton text="Create" type="submit" colour="primary">{{ t('exercise.save') }}</AppButton>
    </div>
  </form>
</template>

<style scoped>
@reference '../../assets/base.css';

/* Sticks above the bottom navigation so saving never needs a scroll. */
.form-actions {
  bottom: calc(4.5rem + env(safe-area-inset-bottom));
  @apply sticky z-20 -mx-3 mt-4 border-t border-border bg-ink-surface px-3 py-3 sm:-mx-5 sm:px-5 lg:-mx-8 lg:px-8;
}
</style>
