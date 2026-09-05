import type { RoutineGroup } from '@/proto/api/v1/routine_service_pb'
import type { Exercise } from '@/proto/api/v1/shared_pb'
import type { DraftGroup } from '@/utils/routineGroups'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import { consumeRequestError, getRoutine, updateRoutine } from '@/http/requests'
import { useToastStore } from '@/stores/toasts'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { RoutineForm } from '@/ui/routines/RoutineForm'

export const EditRoutine = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id = '' } = useParams()

  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [groups, setGroups] = useState<RoutineGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)

  // `superseded` reports that a newer load has taken this one's place, so a
  // stale answer is dropped rather than put on screen.
  const load = useCallback(
    async (superseded: () => boolean = () => false) => {
      const response = await getRoutine(id)
      if (superseded()) return
      if (response?.routine) {
        setName(response.routine.name)
        setExercises(response.routine.exercises)
        setGroups(response.routine.groups)
      }
      setFailed(!response?.routine)
    },
    [id],
  )

  useEffect(() => {
    // Effects run twice under StrictMode, so a second load is already under way
    // by the time the first answers. Without this the abandoned load's answer
    // still lands, and a failed one replaces the form being edited.
    let replaced = false

    const initialLoad = async () => {
      await load(() => replaced)
      if (replaced) return
      setLoading(false)
    }

    void initialLoad()
    return () => {
      replaced = true
    }
  }, [load])

  const onSave = async (
    updatedName: string,
    updatedExerciseIds: string[],
    updatedGroups: DraftGroup[],
  ) => {
    setSaving(true)
    setError(undefined)
    try {
      const response = await updateRoutine(id, updatedName, updatedExerciseIds, updatedGroups)
      if (!response) {
        setError(consumeRequestError() ?? t('common.somethingWentWrong'))
        return
      }

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
      error={error}
      onSave={(updatedName, updatedIds, updatedGroups) =>
        void onSave(updatedName, updatedIds, updatedGroups)
      }
    />
  )
}
