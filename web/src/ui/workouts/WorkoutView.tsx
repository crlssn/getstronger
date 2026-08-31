import type { Workout } from '@/proto/api/v1/workout_service_pb'

import { CheckIcon, ChevronRightIcon, PlayIcon } from '@heroicons/react/24/outline'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { consumeRequestError, listWorkouts } from '@/http/requests'
import { AppInlineError } from '@/ui/components/AppInlineError'
import { useAuthStore } from '@/stores/auth'
import { useConfirmationStore } from '@/stores/confirmation'
import { selectActivePlan, selectNextRoutine, useDashboardStore } from '@/stores/dashboard'
import { usePlanStore } from '@/stores/plans'
import { AppButton } from '@/ui/components/AppButton'
import { AppChip } from '@/ui/components/AppChip'
import { AppEmptyInline } from '@/ui/components/AppEmptyInline'
import { AppList } from '@/ui/components/AppList'
import { AppListRow } from '@/ui/components/AppListRow'
import { AppPageHeader } from '@/ui/components/AppPageHeader'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { formatTimestamp } from '@/utils/datetime'
import { estimatedSessionMinutes } from '@/utils/sessionEstimate'
import { formatNumber } from '@/utils/numbers'
import { useInfiniteScroll } from '@/utils/useInfiniteScroll'
import { workoutSummary } from '@/utils/workoutSummary'
import styles from './WorkoutView.module.css'

// Far enough ahead that the next page is usually there by the time the reader
// reaches the end of this one.
const historyPrefetchMargin = '400px 0px'

/** The workout tab: what to train next, a quick session, and what came before. */
export const WorkoutView = () => {
  const { t } = useTranslation()

  const userId = useAuthStore((state) => state.userId)
  const activePlan = useDashboardStore(selectActivePlan)
  const nextRoutine = useDashboardStore(selectNextRoutine)

  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [reachedEnd, setReachedEnd] = useState(false)
  const [failed, setFailed] = useState(false)
  const [actionError, setActionError] = useState<string>()

  // Held in refs rather than state: neither is rendered, and reading them from
  // state would put the loader's identity at the mercy of a render.
  const pageToken = useRef<Uint8Array>(new Uint8Array(0))
  const inFlight = useRef(false)

  const loadMoreHistory = useCallback(async () => {
    if (inFlight.current || !useAuthStore.getState().userId) return
    inFlight.current = true
    setLoading(true)
    setFailed(false)

    try {
      const response = await listWorkouts([useAuthStore.getState().userId], pageToken.current)
      setLoaded(true)

      if (!response) {
        setFailed(true)
        return
      }

      setWorkouts((current) => {
        const seen = new Set(current.map((workout) => workout.id))
        const fresh = response.workouts.filter((workout) => !seen.has(workout.id))
        return fresh.length ? [...current, ...fresh] : current
      })

      const nextPageToken = response.pagination?.nextPageToken ?? new Uint8Array(0)
      pageToken.current = nextPageToken
      setReachedEnd(nextPageToken.length === 0)
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void useDashboardStore.getState().load()
    void usePlanStore.getState().load()
    void loadMoreHistory()
  }, [loadMoreHistory])

  // Switching the observer back on after a page lands is what asks for the next
  // one while the sentinel is still in view. A failure stops that, so a failing
  // endpoint is retried by its button rather than by the scroll position.
  const sentinel = useInfiniteScroll<HTMLDivElement>(
    () => void loadMoreHistory(),
    !loading && !reachedEnd && !failed && Boolean(userId),
    historyPrefetchMargin,
  )

  const plannedStart = nextRoutine
    ? `/workouts/routine/${nextRoutine.id}${activePlan ? `?plan_id=${activePlan.id}` : ''}`
    : '/plans'

  const skip = async () => {
    if (!activePlan || !nextRoutine) return

    const confirmed = await useConfirmationStore.getState().confirm({
      body: t('workout.skipConfirmBody'),
      confirmLabel: t('workout.skip'),
      title: t('workout.skipConfirmTitle', { name: nextRoutine.name }),
    })
    if (!confirmed) return

    setActionError(undefined)
    if (await usePlanStore.getState().skip(activePlan.id)) {
      await useDashboardStore.getState().load()
      return
    }
    setActionError(consumeRequestError() ?? t('common.somethingWentWrong'))
  }

  // The row earns its space with the stats that matter: date, volume, sets.
  // Duration was "60 min" on nearly every row; it lives on the detail view.
  const workoutMeta = (workout: Workout) => {
    const { setCount } = workoutSummary(workout)
    const parts = [formatTimestamp(workout.finishedAt)]

    if (workout.intensity > 0) {
      parts.push(`${formatNumber(workout.intensity)} ${t('common.kg')}`)
    }
    if (setCount > 0) parts.push(t('workout.setsCompact', { count: setCount }))

    return parts.join(' · ')
  }

  return (
    <div className={styles.workoutPage}>
      <AppPageHeader lead={t('workout.subtitle')} title={t('workout.heading')} />

      {nextRoutine ? (
        <section className={styles.nextCard}>
          <header>
            <p className={styles.eyebrow}>
              {activePlan ? t('training.activePlan') : t('home.upNext')}
            </p>
            {activePlan && (
              <span>
                {activePlan.currentPosition + 1} {t('common.of')} {activePlan.routines.length}
              </span>
            )}
          </header>
          <h2>{nextRoutine.name}</h2>
          {activePlan && <p className={styles.planName}>{activePlan.name}</p>}
          <p>
            {t('home.exerciseCount', { count: nextRoutine.exercises.length })} ·{' '}
            {t('home.aboutMinutes', {
              count: estimatedSessionMinutes(nextRoutine.exercises.length),
            })}
          </p>
          <AppButton type="link" colour="secondary" className="mt-5" to={plannedStart}>
            <PlayIcon className="size-5" aria-hidden="true" /> {t('workout.startRoutine')}
          </AppButton>
          {activePlan && (
            <AppButton
              type="button"
              colour="ghost"
              size="sm"
              className={styles.skipButton}
              onClick={() => void skip()}
            >
              {t('workout.skipRoutine')}
            </AppButton>
          )}
          {actionError && <AppInlineError>{actionError}</AppInlineError>}
        </section>
      ) : (
        <section className={styles.emptyCard}>
          <h2>{t('workout.noSelection')}</h2>
          <p>{t('workout.noSelectionBody')}</p>
          <AppButton type="link" colour="primary" width="auto" className="mt-4" to="/plans">
            {t('home.chooseRoutine')}
          </AppButton>
        </section>
      )}

      <Link to="/workouts/quick" className={styles.quickCard}>
        <span>
          <strong>{t('workout.quick')}</strong>
          <small>{t('workout.quickBody')}</small>
        </span>
        <ChevronRightIcon aria-hidden="true" />
      </Link>

      <section className={styles.workoutHistory}>
        <header>
          <h2>{t('workout.previous')}</h2>
        </header>

        {workouts.length > 0 && (
          <AppList className={styles.historyList}>
            {workouts.map((workout) => (
              <AppListRow
                key={workout.id}
                meta={<small>{workoutMeta(workout)}</small>}
                title={
                  workoutSummary(workout).personalBestCount > 0 ? (
                    <>
                      {workout.name} <AppChip tone="record">{t('common.pr')}</AppChip>
                    </>
                  ) : (
                    workout.name
                  )
                }
                to={`/workouts/${workout.id}`}
              />
            ))}
          </AppList>
        )}

        {!loaded ? (
          <AppSkeleton />
        ) : failed ? (
          <div className={styles.historyError} role="alert">
            <span>{t('workout.historyError')}</span>
            <AppButton
              type="button"
              colour="destructive"
              size="sm"
              width="auto"
              onClick={() => void loadMoreHistory()}
            >
              {t('common.retry')}
            </AppButton>
          </div>
        ) : workouts.length === 0 ? (
          <AppEmptyInline className={styles.historyEmpty}>
            {t('workout.historyEmpty')}
          </AppEmptyInline>
        ) : loading ? (
          <div className={styles.historyStatus} aria-live="polite">
            <span className={styles.historySpinner} /> {t('workout.loadingMoreHistory')}
          </div>
        ) : (
          reachedEnd && (
            <div className={styles.historyEnd} role="status">
              <CheckIcon aria-hidden="true" /> {t('workout.historyEnd')}
            </div>
          )
        )}

        <div ref={sentinel} className={styles.historySentinel} aria-hidden="true" />
      </section>
    </div>
  )
}
