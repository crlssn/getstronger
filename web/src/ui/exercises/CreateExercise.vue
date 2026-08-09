<script setup lang="ts">
import { onMounted, ref } from 'vue'
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
  alertStore.setSuccess('Exercise created')
  await router.push('/exercises')
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <h6>Name</h6>
    <AppList>
      <AppListItemInput :model="req.name" type="text" required @update="(n) => (req.name = n)" />
    </AppList>

    <h6>Tags <small>Optional</small></h6>
    <ExerciseTagsInput v-model="req.tags" :suggestions="tagSuggestions" />

    <h6>Tracking</h6>
    <ExerciseMeasurementSettings v-model:metrics="req.metrics" v-model:rest-seconds="req.restSeconds" />

    <div class="form-actions">
      <AppButton text="Create" type="submit" colour="primary">Save Exercise</AppButton>
    </div>
  </form>
</template>

<style scoped>
.form-actions {
  @apply mt-4;
}
</style>
