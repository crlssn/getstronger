import type { ExerciseSet } from '@/proto/api/v1/shared_pb'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { getPersonalBests } from '@/http/requests'
import { AppList } from '@/ui/components/AppList'
import { AppListItem, AppListItemLink } from '@/ui/components/AppListItem'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { ExerciseTags } from '@/ui/exercises/ExerciseTags'
import { formatToRelativeDateTime } from '@/utils/datetime'
import { formatExerciseSet } from '@/utils/exerciseMeasurements'

/** This profile's best set for every exercise they have logged. */
export const UserPersonalBests = () => {
  const { t } = useTranslation()
  const { id = '' } = useParams()

  const [personalBests, setPersonalBests] = useState<ExerciseSet[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const load = async () => {
      const res = await getPersonalBests(id)
      if (res) setPersonalBests(res.personalBests)
      setLoaded(true)
    }
    void load()
  }, [id])

  if (!loaded) return <AppSkeleton />

  return (
    <AppList>
      {personalBests.length === 0 && <AppListItem>{t('common.nothingHere')}</AppListItem>}
      {personalBests.map((best) => (
        <AppListItemLink key={best.exercise?.id} to={`/exercises/${best.exercise?.id}`}>
          <div className="font-semibold">
            {best.exercise?.name}
            <ExerciseTags compact tags={best.exercise?.tags} />
            <p className="mt-1 text-sm font-normal text-text-muted">
              {formatToRelativeDateTime(best.set?.metadata?.createdAt)}
            </p>
          </div>
          {best.set ? formatExerciseSet(best.set, best.exercise) : ''}
        </AppListItemLink>
      ))}
    </AppList>
  )
}
