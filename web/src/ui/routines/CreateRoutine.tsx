import type { DraftGroup } from '@/utils/routineGroups'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { consumeRequestError, createRoutine } from '@/http/requests'
import posthog from '@/posthog'
import { useToastStore } from '@/stores/toasts'
import { RoutineForm } from '@/ui/routines/RoutineForm'

export const CreateRoutine = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  const onSave = async (name: string, exerciseIds: string[], groups: DraftGroup[]) => {
    setSaving(true)
    setError(undefined)
    try {
      const response = await createRoutine(name, exerciseIds, groups)
      if (!response) {
        setError(consumeRequestError() ?? t('common.somethingWentWrong'))
        return
      }

      posthog.capture('routine_created')
      useToastStore.getState().success(t('routine.form.created'))
      await navigate('/routines')
    } finally {
      setSaving(false)
    }
  }

  return (
    <RoutineForm
      submitLabel={t('routine.form.create')}
      saving={saving}
      error={error}
      onSave={(name, exerciseIds, groups) => void onSave(name, exerciseIds, groups)}
    />
  )
}
