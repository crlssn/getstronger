import type { ExerciseSet } from '@/proto/api/v1/shared_pb'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { getPersonalBests } from '@/http/requests'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppEmptyInline } from '@/ui/components/AppEmptyInline'
import { AppList } from '@/ui/components/AppList'
import { AppListItem } from '@/ui/components/AppListItem'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { RecordRow } from '@/ui/features/RecordRow'

/** This profile's best set for every exercise they have logged. */
export const UserPersonalBests = () => {
  const { t } = useTranslation()
  const { id = '' } = useParams()

  const [personalBests, setPersonalBests] = useState<ExerciseSet[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    const res = await getPersonalBests(id)
    if (res) setPersonalBests(res.personalBests)
    setFailed(!res)
  }, [id])

  useEffect(() => {
    const initialLoad = async () => {
      await load()
      setLoaded(true)
    }
    void initialLoad()
  }, [load])

  if (!loaded) return <AppSkeleton />
  if (failed) return <AppErrorState onRetry={() => void load()} />

  return (
    <AppList>
      {personalBests.length === 0 && (
        <AppListItem>
          <AppEmptyInline className="w-full">{t('common.nothingHere')}</AppEmptyInline>
        </AppListItem>
      )}
      {personalBests.map((best) => (
        <RecordRow key={best.exercise?.id} record={best} />
      ))}
    </AppList>
  )
}
