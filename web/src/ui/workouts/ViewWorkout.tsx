import type { Workout } from '@/proto/api/v1/workout_service_pb'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { consumeRequestNotFound, getWorkout } from '@/http/requests'
import { haptic } from '@/native/haptics'
import { usePageTitleStore } from '@/stores/pageTitle'
import { useToastStore } from '@/stores/toasts'
import { AppButton } from '@/ui/components/AppButton'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { CardWorkout } from '@/ui/features/CardWorkout'
import { RecordCelebration } from '@/ui/features/RecordCelebration'
import { workoutSummary } from '@/utils/workoutSummary'
import styles from './ViewWorkout.module.css'

/** One finished workout, in full. */
export const ViewWorkout = () => {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const [workout, setWorkout] = useState<Workout>()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  // Played once, then kept for its announcement.
  const [celebration, setCelebration] = useState<'playing' | 'over'>()
  // Set by the save that opened this page, which is reported here once the
  // workout says whether it holds a record. A ref: StrictMode loads twice.
  const justSaved = useRef(Boolean((location.state as { saved?: boolean } | null)?.saved))
  const endCelebration = useCallback(() => setCelebration('over'), [])

  const load = useCallback(async () => {
    const res = await getWorkout(id)

    // A refusal, a server error and an unreachable backend all answer with
    // void, and only the first of the three means the workout is gone.
    const gone = consumeRequestNotFound()
    setFailed(!res && !gone)
    setWorkout(res?.workout)
    usePageTitleStore.getState().setPageTitle(res?.workout?.name ?? t('common.workout'))
    setLoading(false)

    if (!justSaved.current) return
    justSaved.current = false
    // Out of history too, so a reload or a Back into it does not report it again.
    void navigate(`/workouts/${id}`, { replace: true })

    // A record takes the saved toast's place, and its buzz.
    if (res?.workout && workoutSummary(res.workout).personalBestCount > 0) {
      haptic('personalBest')
      setCelebration('playing')
    } else {
      haptic('workoutSaved')
      useToastStore.getState().success(t('workout.saved'))
    }
  }, [id, navigate, t])

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

  return (
    <>
      <CardWorkout workout={workout} compact={false} celebrating={celebration === 'playing'} />
      {celebration && (
        <RecordCelebration
          workout={workout}
          playing={celebration === 'playing'}
          onDone={endCelebration}
        />
      )}
    </>
  )
}
