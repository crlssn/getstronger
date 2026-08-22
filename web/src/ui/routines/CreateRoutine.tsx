import type { DraftGroup } from '@/utils/routineGroups'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { createRoutine } from '@/http/requests'
import posthog from '@/posthog'
import { useToastStore } from '@/stores/toasts'
import { RoutineForm } from '@/ui/routines/RoutineForm'

export const CreateRoutine = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)

  const onSave = async (name: string, exerciseIds: string[], groups: DraftGroup[]) => {
    setSaving(true)
    try {
      const response = await createRoutine(name, exerciseIds, groups)
      if (!response) return

      posthog.capture('routine_created')
      useToastStore.getState().success(t('routine.form.created'))
      await navigate('/routines')
    } finally {
      setSaving(false)
    }
  }

  return (
    <RoutineForm
      submitLabel={t('home.createRoutine')}
      saving={saving}
      onSave={(name, exerciseIds, groups) => void onSave(name, exerciseIds, groups)}
    />
  )
}
