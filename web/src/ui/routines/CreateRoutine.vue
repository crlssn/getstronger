<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { createRoutine } from '@/http/requests'
import { useAlertStore } from '@/stores/alerts'
import RoutineForm from '@/ui/routines/RoutineForm.vue'

const router = useRouter()
const alertStore = useAlertStore()
const saving = ref(false)

const onSave = async (name: string, exerciseIds: string[]) => {
  saving.value = true
  try {
    const response = await createRoutine(name, exerciseIds)
    if (!response) return

    alertStore.setSuccess('Routine created')
    await router.push('/routines')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <RoutineForm submit-label="Create routine" :saving="saving" @save="onSave" />
</template>
