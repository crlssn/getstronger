import type { Workout } from '@/proto/api/v1/workout_service_pb'

import {
  CheckIcon,
  FireIcon,
  ListBulletIcon,
  PlayIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import { DateTime } from 'luxon'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { listFeedItems } from '@/http/requests'
import { dateLocale } from '@/i18n'
import { selectActivePlan, selectNextRoutine, useDashboardStore } from '@/stores/dashboard'
import { cn } from '@/ui/cn'
import { AppEmptyState } from '@/ui/components/AppEmptyState'
import { AppSheet } from '@/ui/components/AppSheet'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { CardWorkout } from '@/ui/components/CardWorkout'
import { HomePageActions } from '@/ui/components/HomePageActions'
import { StreakCard } from '@/ui/components/StreakCard'
import { useInfiniteScroll } from '@/utils/useInfiniteScroll'
import styles from './HomeView.module.css'

// Eight minutes an exercise, and never a session that claims to be shorter than
// getting changed for it.
const minutesPerExercise = 8
const minimumEstimatedMinutes = 30

// Far enough ahead that the next page is usually there by the time the reader
// reaches the end of this one.
const feedPrefetchMargin = '500px 0px'

const greetingKey = (hour: number) => {
  if (hour < 12) return 'home.morning'
  if (hour < 18) return 'home.afternoon'
  return 'home.evening'
}

/** The signed-in landing screen: what to train next, and who else has trained. */
export const HomeView = () => {
  const { t } = useTranslation()

  const dashboard = useDashboardStore((state) => state.dashboard)
  const loading = useDashboardStore((state) => state.loading)
  const nextRoutine = useDashboardStore(selectNextRoutine)
  const activePlan = useDashboardStore(selectActivePlan)

  const [searchOpen, setSearchOpen] = useState(false)
  const [routinePickerOpen, setRoutinePickerOpen] = useState(false)

  const [feedWorkouts, setFeedWorkouts] = useState<Workout[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedLoaded, setFeedLoaded] = useState(false)
  const [feedReachedEnd, setFeedReachedEnd] = useState(false)
  const [feedError, setFeedError] = useState(false)

  // Held in refs rather than state: neither is rendered, and reading them from
  // state would put the loader's identity at the mercy of a render.
  const pageToken = useRef<Uint8Array>(new Uint8Array(0))
  const inFlight = useRef(false)

  const loadMoreFeed = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setFeedLoading(true)
    setFeedError(false)

    try {
      const feed = await listFeedItems(pageToken.current, true)
      setFeedLoaded(true)

      if (!feed) {
        setFeedError(true)
        return
      }

      setFeedWorkouts((current) => {
        const seen = new Set(current.map((workout) => workout.id))
        const fresh: Workout[] = []
        for (const item of feed.items) {
          if (item.type.case !== 'workout' || seen.has(item.type.value.id)) continue
          seen.add(item.type.value.id)
          fresh.push(item.type.value)
        }
        return fresh.length ? [...current, ...fresh] : current
      })

      const nextPageToken = feed.pagination?.nextPageToken ?? new Uint8Array(0)
      pageToken.current = nextPageToken
      setFeedReachedEnd(nextPageToken.length === 0)
    } finally {
      inFlight.current = false
      setFeedLoading(false)
    }
  }, [])

  useEffect(() => {
    void useDashboardStore.getState().load()
    void loadMoreFeed()
  }, [loadMoreFeed])

  // Switching the observer back on after a page lands is what asks for the next
  // one while the sentinel is still in view. An error stops that, so a failing
  // endpoint is retried by the button rather than by the scroll position.
  const feedSentinel = useInfiniteScroll<HTMLDivElement>(
    () => void loadMoreFeed(),
    !feedLoading && !feedReachedEnd && !feedError,
    feedPrefetchMargin,
  )

  const nextWorkoutHref = nextRoutine
    ? `/workouts/routine/${nextRoutine.id}${activePlan ? `?plan_id=${activePlan.id}` : ''}`
    : '/workout'
  const estimatedMinutes = Math.max(
    minimumEstimatedMinutes,
    (nextRoutine?.exercises.length ?? 0) * minutesPerExercise,
  )

  const selectRoutine = async (routineId: string) => {
    await useDashboardStore.getState().selectRoutine(routineId)
    setRoutinePickerOpen(false)
  }

  return (
    <>
      <div className={styles.dashboardStack}>
        <section className={cn(styles.welcomeRow, searchOpen && styles.searching)}>
          {!searchOpen && (
            <div>
              <p className={styles.eyebrow}>
                {DateTime.now().setLocale(dateLocale).toFormat('EEEE, d LLLL')}
              </p>
              <h1>{t(greetingKey(DateTime.now().hour))}</h1>
            </div>
          )}
          <HomePageActions open={searchOpen} onOpenChange={setSearchOpen} />
        </section>

        {!searchOpen && (
          <>
            <StreakCard />

            {loading && !dashboard ? (
              <AppSkeleton />
            ) : nextRoutine ? (
              <section className={styles.nextSession}>
                <div>
                  <div className={styles.nextLabelRow}>
                    <p className={styles.eyebrow}>{t('home.upNext')}</p>
                    {activePlan ? (
                      <span className={styles.planProgress}>
                        {activePlan.currentPosition + 1} {t('common.of')}{' '}
                        {activePlan.routines.length}
                      </span>
                    ) : (
                      <span className={styles.readyStatus}>
                        <CheckIcon aria-hidden="true" /> {t('home.ready')}
                      </span>
                    )}
                  </div>
                  <h2>{nextRoutine.name}</h2>
                  {activePlan && <p className={styles.planSource}>{activePlan.name}</p>}
                  <p className={styles.sessionMeta}>
                    {t('home.exerciseCount', { count: nextRoutine.exercises.length })}
                    <span aria-hidden="true">•</span>
                    {t('home.aboutMinutes', { count: estimatedMinutes })}
                  </p>
                </div>
                <div className={styles.sessionActions}>
                  <Link to={nextWorkoutHref} className={styles.startButton}>
                    <PlayIcon aria-hidden="true" /> {t('home.startWorkout')}
                  </Link>
                  {activePlan ? (
                    <Link to="/workout" className={styles.chooseButton}>
                      {t('home.workoutOptions')}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={styles.chooseButton}
                      onClick={() => setRoutinePickerOpen(true)}
                    >
                      {t('home.chooseRoutine')}
                    </button>
                  )}
                </div>
              </section>
            ) : (
              <AppEmptyState
                action={{ label: t('home.createRoutine'), to: '/routines/create' }}
                body={t('home.createFirstRoutineBody')}
                title={t('home.createFirstRoutine')}
                icon={<ListBulletIcon />}
              />
            )}

            <section className={styles.followingFeed}>
              <header>
                <p className={styles.eyebrow}>{t('home.following')}</p>
                <h2>{t('home.latestWorkouts')}</h2>
              </header>

              {feedWorkouts.map((workout) => (
                <CardWorkout key={workout.id} compact workout={workout} />
              ))}

              {!feedLoaded ? (
                <AppSkeleton />
              ) : feedError ? (
                <div className={styles.feedError} role="alert">
                  <span>{t('home.loadFailed')}</span>
                  <button type="button" onClick={() => void loadMoreFeed()}>
                    {t('common.retry')}
                  </button>
                </div>
              ) : feedWorkouts.length === 0 ? (
                <AppEmptyState
                  action={{ label: t('home.emptyFeedAction') }}
                  body={t('home.emptyFeed')}
                  title={t('home.emptyFeedTitle')}
                  icon={<UsersIcon />}
                  onAction={() => setSearchOpen(true)}
                />
              ) : feedLoading ? (
                <div className={styles.feedStatus} aria-live="polite">
                  <span className={styles.feedSpinner} /> {t('home.loadingMore')}
                </div>
              ) : (
                feedReachedEnd && (
                  <div className={styles.feedEnd} role="status">
                    <span>
                      <CheckIcon aria-hidden="true" />
                    </span>
                    <div>
                      <strong>{t('home.caughtUp')}</strong>
                      <small>{t('home.reachedEnd')}</small>
                    </div>
                  </div>
                )
              )}

              <div ref={feedSentinel} className={styles.feedSentinel} aria-hidden="true" />
            </section>
          </>
        )}
      </div>

      {routinePickerOpen && (
        <AppSheet
          eyebrow={t('home.changeNext')}
          title={t('home.chooseRoutine')}
          closeLabel={t('home.closePicker')}
          onClose={() => setRoutinePickerOpen(false)}
        >
          <div className={styles.routineOptions}>
            {dashboard?.routines.map((routine) => (
              <button
                key={routine.id}
                type="button"
                className={cn(routine.id === nextRoutine?.id && styles.selected)}
                onClick={() => void selectRoutine(routine.id)}
              >
                <span className={styles.routineIcon}>
                  <FireIcon aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <strong>{routine.name}</strong>
                  <small>{t('home.exerciseCount', { count: routine.exercises.length })}</small>
                </span>
                <span className={styles.selectionIcon}>
                  <CheckIcon aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>
        </AppSheet>
      )}
    </>
  )
}
