import type { RoutineGroup } from '@/proto/api/v1/routine_service_pb'
import type { Exercise } from '@/proto/api/v1/shared_pb'
import type { DraftGroup } from '@/utils/routineGroups'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { getRoutine, updateRoutine } from '@/http/requests'
import { useToastStore } from '@/stores/toasts'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { RoutineForm } from '@/ui/routines/RoutineForm'

export const EditRoutine = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id = '' } = useParams()

  const [name, setName] = useState('')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [groups, setGroups] = useState<RoutineGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      const response = await getRoutine(id)
      if (response?.routine) {
        setName(response.routine.name)
        setExercises(response.routine.exercises)
        setGroups(response.routine.groups)
      }
      setLoading(false)
    }
    void load()
  }, [id])

  const onSave = async (
    updatedName: string,
    updatedExerciseIds: string[],
    updatedGroups: DraftGroup[],
  ) => {
    setSaving(true)
    try {
      const response = await updateRoutine(id, updatedName, updatedExerciseIds, updatedGroups)
      if (!response) return

      useToastStore.getState().success(t('routine.form.updated'))
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
      initialExercises={exercises}
      initialGroups={groups}
      saving={saving}
      onSave={(updatedName, updatedIds, updatedGroups) =>
        void onSave(updatedName, updatedIds, updatedGroups)
      }
    />
  )
}
