import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { listWorkouts } from '@/http/requests'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppEmptyState } from '@/ui/components/AppEmptyState'
import { AppList } from '@/ui/components/AppList'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { CardWorkout } from '@/ui/features/CardWorkout'
import { useInfiniteScroll } from '@/utils/useInfiniteScroll'
import { usePagedList } from '@/utils/usePagedList'

/** This profile's finished workouts, newest first. */
export const UserWorkouts = () => {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const {
    rows: workouts,
    loaded,
    fetching,
    failed,
    hasMorePages,
    fetchMore: fetchWorkouts,
  } = usePagedList('workouts', async (pageToken) => {
    const res = await listWorkouts([id], pageToken)
    return res && { rows: res.workouts, pagination: res.pagination }
  })

  const sentinel = useInfiniteScroll<HTMLDivElement>(
    () => void fetchWorkouts(),
    hasMorePages && !fetching && !failed,
  )

  if (!loaded) return <AppSkeleton />
  if (failed && workouts.length === 0) return <AppErrorState onRetry={() => void fetchWorkouts()} />

  return (
    <>
      {workouts.length > 0 && (
        <AppList>
          {workouts.map((workout) => (
            <CardWorkout key={workout.id} compact workout={workout} />
          ))}
        </AppList>
      )}

      {failed ? (
        <AppErrorState compact onRetry={() => void fetchWorkouts()} />
      ) : (
        hasMorePages && <div ref={sentinel} aria-hidden="true" />
      )}

      {workouts.length === 0 && (
        <AppEmptyState
          action="none"
          body={t('profile.workoutsEmptyBody')}
          title={t('profile.workoutsEmptyTitle')}
        />
      )}
    </>
  )
}
