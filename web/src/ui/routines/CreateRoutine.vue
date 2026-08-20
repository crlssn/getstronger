<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { createRoutine } from '@/http/requests'
import { useAlertStore } from '@/stores/alerts'
import RoutineForm from '@/ui/routines/RoutineForm.vue'
import posthog from '@/posthog'

const { t } = useI18n()
const router = useRouter()
const alertStore = useAlertStore()
const saving = ref(false)

const onSave = async (name: string, exerciseIds: string[]) => {
  saving.value = true
  try {
    const response = await createRoutine(name, exerciseIds)
    if (!response) return

    posthog.capture('routine_created')
    alertStore.setSuccess(t('routine.form.created'))
    await router.push('/routines')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <RoutineForm :submit-label="t('home.createRoutine')" :saving="saving" @save="onSave" />
</template>
