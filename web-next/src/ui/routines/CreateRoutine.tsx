import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { createRoutine } from '@/http/requests'
import posthog from '@/posthog'
import { useAlertStore } from '@/stores/alerts'
import { RoutineForm } from '@/ui/routines/RoutineForm'

export const CreateRoutine = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)

  const onSave = async (name: string, exerciseIds: string[]) => {
    setSaving(true)
    try {
      const response = await createRoutine(name, exerciseIds)
      if (!response) return

      posthog.capture('routine_created')
      useAlertStore.getState().setSuccess(t('routine.form.created'))
      await navigate('/routines')
    } finally {
      setSaving(false)
    }
  }

  return (
    <RoutineForm
      submitLabel={t('home.createRoutine')}
      saving={saving}
      onSave={(name, exerciseIds) => void onSave(name, exerciseIds)}
    />
  )
}
