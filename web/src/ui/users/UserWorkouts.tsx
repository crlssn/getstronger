import type { Workout } from '@/proto/api/v1/workout_service_pb'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { listWorkouts } from '@/http/requests'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppEmptyState } from '@/ui/components/AppEmptyState'
import { AppList } from '@/ui/components/AppList'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { CardWorkout } from '@/ui/features/CardWorkout'
import { useInfiniteScroll } from '@/utils/useInfiniteScroll'
import { appendPage } from '@/utils/appendPage'
import { usePagination } from '@/utils/usePagination'

/** This profile's finished workouts, newest first. */
export const UserWorkouts = () => {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const { hasMorePages, currentPageToken, setFromResponse } = usePagination()

  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loaded, setLoaded] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [failed, setFailed] = useState(false)

  const fetchWorkouts = useCallback(async () => {
    setFetching(true)
    setFailed(false)
    try {
      const res = await listWorkouts([id], currentPageToken())
      if (!res) {
        setFailed(true)
        return
      }

      setWorkouts((current) => appendPage(current, res.workouts))
      setFromResponse(res.pagination)
    } finally {
      setFetching(false)
    }
  }, [id, currentPageToken, setFromResponse])

  useEffect(() => {
    const load = async () => {
      await fetchWorkouts()
      setLoaded(true)
    }
    void load()
  }, [fetchWorkouts])

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
