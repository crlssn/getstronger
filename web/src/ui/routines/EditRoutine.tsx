import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { getRoutine, updateRoutine } from '@/http/requests'
import { useAlertStore } from '@/stores/alerts'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { RoutineForm } from '@/ui/routines/RoutineForm'

export const EditRoutine = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id = '' } = useParams()

  const [name, setName] = useState('')
  const [exerciseIds, setExerciseIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      const response = await getRoutine(id)
      if (response?.routine) {
        setName(response.routine.name)
        setExerciseIds(response.routine.exercises.map((exercise) => exercise.id))
      }
      setLoading(false)
    }
    void load()
  }, [id])

  const onSave = async (updatedName: string, updatedExerciseIds: string[]) => {
    setSaving(true)
    try {
      const response = await updateRoutine(id, updatedName, updatedExerciseIds)
      if (!response) return

      useAlertStore.getState().setSuccess(t('routine.form.updated'))
      await navigate(`/routines/${id}`)
    } finally {
      setSaving(false)
    }
  }

  // The form reads its initial values once, so it is only mounted with them.
  if (loading) return <AppSkeleton />

  return (
    <RoutineForm
      submitLabel={t('training.planForm.saveChanges')}
      initialName={name}
      initialExerciseIds={exerciseIds}
      saving={saving}
      onSave={(updatedName, updatedIds) => void onSave(updatedName, updatedIds)}
    />
  )
}
