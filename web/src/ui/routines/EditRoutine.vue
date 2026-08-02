<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getRoutine, updateRoutine } from '@/http/requests'
import { useAlertStore } from '@/stores/alerts'
import RoutineForm from '@/ui/routines/RoutineForm.vue'

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

    alertStore.setSuccess('Routine updated')
    await router.push(`/routines/${route.params.id}`)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="loading" class="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
    Loading routine…
  </div>
  <RoutineForm
    v-else
    submit-label="Save changes"
    :initial-name="name"
    :initial-exercise-ids="exerciseIds"
    :saving="saving"
    @save="onSave"
  />
</template>
