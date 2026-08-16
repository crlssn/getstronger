<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { getRoutine, updateRoutine } from '@/http/requests'
import { useAlertStore } from '@/stores/alerts'
import RoutineForm from '@/ui/routines/RoutineForm.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const alertStore = useAlertStore()
const name = ref('')
const exerciseIds = ref<string[]>([])
const loading = ref(true)
const saving = ref(false)

onMounted(async () => {
  const response = await getRoutine(route.params.id as string)
  if (response?.routine) {
    name.value = response.routine.name
    exerciseIds.value = response.routine.exercises.map((exercise) => exercise.id)
  }
  loading.value = false
})

const onSave = async (updatedName: string, updatedExerciseIds: string[]) => {
  saving.value = true
  try {
    const response = await updateRoutine(route.params.id as string, updatedName, updatedExerciseIds)
    if (!response) return

    alertStore.setSuccess(t('routine.form.updated'))
    await router.push(`/routines/${route.params.id}`)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="loading" class="card shadow-none p-6 text-sm text-slate-500">
    {{ t('routine.loading') }}
  </div>
  <RoutineForm
    v-else
    :submit-label="t('training.planForm.saveChanges')"
    :initial-name="name"
    :initial-exercise-ids="exerciseIds"
    :saving="saving"
    @save="onSave"
  />
</template>
