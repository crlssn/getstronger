import type { Workout } from '@/proto/api/v1/workout_service_pb'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'

import { getWorkout } from '@/http/requests'
import { usePageTitleStore } from '@/stores/pageTitle'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { CardWorkout } from '@/ui/features/CardWorkout'
import styles from './ViewWorkout.module.css'

/** One finished workout, in full. */
export const ViewWorkout = () => {
  const { t } = useTranslation()
  const { id = '' } = useParams()

  const [workout, setWorkout] = useState<Workout>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const res = await getWorkout(id)
      setWorkout(res?.workout)
      usePageTitleStore.getState().setPageTitle(res?.workout?.name ?? t('common.workout'))
      setLoading(false)
    }
    void load()
  }, [id, t])

  if (loading) return <AppSkeleton />

  if (!workout) {
    return (
      <section className={styles.emptyCard}>
        <h1>{t('workout.view.unavailable')}</h1>
        <p>{t('workout.view.unavailableBody')}</p>
        <Link to="/workout">{t('workout.view.viewWorkouts')}</Link>
      </section>
    )
  }

  return <CardWorkout workout={workout} compact={false} />
}
