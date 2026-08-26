import type { Workout } from '@/proto/api/v1/workout_service_pb'

import {
  CheckIcon,
  FireIcon,
  PlayIcon,
} from '@heroicons/react/24/outline'
import { DateTime } from 'luxon'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { listFeedItems } from '@/http/requests'
import { dateLocale } from '@/i18n'
import { selectActivePlan, selectNextRoutine, useDashboardStore } from '@/stores/dashboard'
import { cn } from '@/ui/cn'
import { AppButton } from '@/ui/components/AppButton'
import { AppOptionRow } from '@/ui/components/AppOptionRow'
import { AppEmptyState } from '@/ui/components/AppEmptyState'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppSheet } from '@/ui/components/AppSheet'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { CardWorkout } from '@/ui/features/CardWorkout'
import { HomePageActions } from '@/ui/features/HomePageActions'
import { StreakCard } from '@/ui/features/StreakCard'
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
  const dashboardFailed = useDashboardStore((state) => state.failed)
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
                  {/* What it is, how much of it, how long: one line, where three
                      lines spread the card down the screen. */}
                  <p className={styles.sessionMeta}>
                    {activePlan && (
                      <>
                        <strong>{activePlan.name}</strong>
                        <span aria-hidden="true">•</span>
                      </>
                    )}
                    {t('home.exerciseCount', { count: nextRoutine.exercises.length })}
                    <span aria-hidden="true">•</span>
                    {t('home.aboutMinutes', { count: estimatedMinutes })}
                  </p>
                </div>
                <div className={styles.sessionActions}>
                  <AppButton
                    type="link"
                    colour="secondary"
                    className={styles.startButton}
                    to={nextWorkoutHref}
                  >
                    <PlayIcon className="size-5" aria-hidden="true" /> {t('home.startWorkout')}
                  </AppButton>
                  {activePlan ? (
                    <AppButton
                      type="link"
                      colour="ghost"
                      className={styles.chooseButton}
                      to="/workout"
                    >
                      {t('home.workoutOptions')}
                    </AppButton>
                  ) : (
                    <AppButton
                      type="button"
                      colour="ghost"
                      className={styles.chooseButton}
                      onClick={() => setRoutinePickerOpen(true)}
                    >
                      {t('home.chooseRoutine')}
                    </AppButton>
                  )}
                </div>
              </section>
            ) : dashboardFailed ? (
              // Onboarding copy for a user who already has routines is the
              // worst thing this screen can say, so a failed load says so.
              <AppErrorState onRetry={() => void useDashboardStore.getState().load()} />
            ) : (
              <AppEmptyState
                action={{ label: t('home.createRoutine'), to: '/routines/create' }}
                body={t('home.createFirstRoutineBody')}
                title={t('home.createFirstRoutine')}
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
                <AppErrorState
                  compact
                  title={t('home.loadFailed')}
                  onRetry={() => void loadMoreFeed()}
                />
              ) : feedWorkouts.length === 0 ? (
                <AppEmptyState
                  action={{ label: t('home.emptyFeedAction') }}
                  body={t('home.emptyFeed')}
                  title={t('home.emptyFeedTitle')}
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
              <AppOptionRow
                key={routine.id}
                leading={
                  <span className={styles.routineIcon}>
                    <FireIcon aria-hidden="true" />
                  </span>
                }
                selected={routine.id === nextRoutine?.id}
                trailing={
                  <span className={styles.selectionIcon}>
                    <CheckIcon aria-hidden="true" />
                  </span>
                }
                onClick={() => void selectRoutine(routine.id)}
              >
                <strong>{routine.name}</strong>
                <small>{t('home.exerciseCount', { count: routine.exercises.length })}</small>
              </AppOptionRow>
            ))}
          </div>
        </AppSheet>
      )}
    </>
  )
}
