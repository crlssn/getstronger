import type { RoutineGroup } from '@/proto/api/v1/routine_service_pb'
import type { Exercise } from '@/proto/api/v1/shared_pb'
import type { DraftGroup } from '@/utils/routineGroups'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { getRoutine, updateRoutine } from '@/http/requests'
import { useToastStore } from '@/stores/toasts'
import { AppErrorState } from '@/ui/components/AppErrorState'
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
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const response = await getRoutine(id)
    if (response?.routine) {
      setName(response.routine.name)
      setExercises(response.routine.exercises)
      setGroups(response.routine.groups)
    }
    setFailed(!response?.routine)
  }, [id])

  useEffect(() => {
    const initialLoad = async () => {
      await load()
      setLoading(false)
    }
    void initialLoad()
  }, [load])

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

  // A routine that did not load is not an empty routine: the builder opened on
  // a blank name and no exercises, offering to save that over the real one.
  if (failed) return <AppErrorState onRetry={() => void load()} />

  return (
    <RoutineForm
      submitLabel={t('common.saveChanges')}
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
