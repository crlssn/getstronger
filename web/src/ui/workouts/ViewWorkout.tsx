import type { Workout } from '@/proto/api/v1/workout_service_pb'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'

import { consumeRequestNotFound, getWorkout } from '@/http/requests'
import { usePageTitleStore } from '@/stores/pageTitle'
import { AppButton } from '@/ui/components/AppButton'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { CardWorkout } from '@/ui/features/CardWorkout'
import styles from './ViewWorkout.module.css'

/** One finished workout, in full. */
export const ViewWorkout = () => {
  const { t } = useTranslation()
  const { id = '' } = useParams()

  const [workout, setWorkout] = useState<Workout>()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    const res = await getWorkout(id)

    // A refusal, a server error and an unreachable backend all answer with
    // void, and only the first of the three means the workout is gone.
    const gone = consumeRequestNotFound()
    setFailed(!res && !gone)
    setWorkout(res?.workout)
    usePageTitleStore.getState().setPageTitle(res?.workout?.name ?? t('common.workout'))
    setLoading(false)
  }, [id, t])

  useEffect(() => {
    const initialLoad = async () => {
      await load()
    }
    void initialLoad()
  }, [load])

  if (loading) return <AppSkeleton />
  if (failed) return <AppErrorState onRetry={() => void load()} />

  if (!workout) {
    return (
      <section className={styles.emptyCard}>
        <h1>{t('workout.view.unavailable')}</h1>
        <p>{t('workout.view.unavailableBody')}</p>
        <AppButton type="link" colour="primary" width="auto" className="mt-4" to="/workout">
          {t('workout.view.viewWorkouts')}
        </AppButton>
      </section>
    )
  }

  return <CardWorkout workout={workout} compact={false} />
}
