import type { Workout } from '@/proto/api/v1/workout_service_pb'

import { timestampDate } from '@bufbuild/protobuf/wkt'
import { CheckIcon, FireIcon } from '@heroicons/react/24/outline'
import { DateTime } from 'luxon'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { listFeedItems, markFeedAsSeen } from '@/http/requests'
import { dateLocale } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { selectActivePlan, selectNextRoutine, useDashboardStore } from '@/stores/dashboard'
import { cn } from '@/ui/cn'
import { AppButton } from '@/ui/components/AppButton'
import { AppList } from '@/ui/components/AppList'
import { AppOptionRow } from '@/ui/components/AppOptionRow'
import { AppPageHeader } from '@/ui/components/AppPageHeader'
import { AppEmptyState } from '@/ui/components/AppEmptyState'
import { AppErrorState } from '@/ui/components/AppErrorState'
import { AppSheet } from '@/ui/components/AppSheet'
import { AppSkeleton } from '@/ui/components/AppSkeleton'
import { CardWorkout } from '@/ui/features/CardWorkout'
import { HomePageActions } from '@/ui/features/HomePageActions'
import { RoutineCarousel } from '@/ui/features/RoutineCarousel'
import { StreakCard } from '@/ui/features/StreakCard'
import { useInfiniteScroll } from '@/utils/useInfiniteScroll'
import styles from './HomeView.module.css'

// Far enough ahead that the next page is usually there by the time the reader
// reaches the end of this one.
const feedPrefetchMargin = '500px 0px'

/** A feed row, and whether it arrived since the reader last looked. */
interface FeedEntry {
  workout: Workout
  unseen: boolean
}

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

  const [feedEntries, setFeedEntries] = useState<FeedEntry[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedLoaded, setFeedLoaded] = useState(false)
  const [feedReachedEnd, setFeedReachedEnd] = useState(false)
  const [feedError, setFeedError] = useState(false)

  // Held in refs rather than state: neither is rendered, and reading them from
  // state would put the loader's identity at the mercy of a render.
  const pageToken = useRef<Uint8Array>(new Uint8Array(0))
  const inFlight = useRef(false)
  // Where the feed draws its line between new and seen, as the first page
  // reported it: `at` is unset for a first look, which has nothing to catch up
  // on. Showing the first page moves the server's line to now, so the pages
  // after report a line that would hide what this visit is here to see.
  const seenLine = useRef<{ at?: Date }>(undefined)

  const loadMoreFeed = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setFeedLoading(true)
    setFeedError(false)

    try {
      const firstPage = pageToken.current.length === 0
      const feed = await listFeedItems(pageToken.current, true)
      setFeedLoaded(true)

      if (!feed) {
        setFeedError(true)
        return
      }

      if (firstPage) {
        seenLine.current = { at: feed.seenAt && timestampDate(feed.seenAt) }
        // Shown is seen: nothing has to be opened for the next visit to start
        // from here.
        void markFeedAsSeen()
      }

      // Read once here rather than subscribed to, so the loader's identity
      // does not depend on the session.
      const { userId } = useAuthStore.getState()
      const line = seenLine.current?.at
      const arrivedAfterLine = (item: (typeof feed.items)[number]) =>
        line !== undefined && item.createdAt !== undefined && timestampDate(item.createdAt) > line

      setFeedEntries((current) => {
        const seen = new Set(current.map((entry) => entry.workout.id))
        const fresh: FeedEntry[] = []
        for (const item of feed.items) {
          if (item.type.case !== 'workout' || seen.has(item.type.value.id)) continue
          seen.add(item.type.value.id)
          // Your own session is never news to you.
          const unseen = arrivedAfterLine(item) && item.type.value.user?.id !== userId
          fresh.push({ workout: item.type.value, unseen })
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

  const selectRoutine = async (routineId: string) => {
    await useDashboardStore.getState().selectRoutine(routineId)
    setRoutinePickerOpen(false)
  }

  return (
    <>
      <div className={styles.dashboardStack}>
        {/* Searching gives the whole row to the panel; otherwise the screen
            opens with the same title block as every other tab root, and the
            magnifier is that header's one trailing action. */}
        {searchOpen ? (
          <section className={cn(styles.welcomeRow, styles.searching)}>
            <HomePageActions open onOpenChange={setSearchOpen} />
          </section>
        ) : (
          <AppPageHeader
            action={<HomePageActions open={false} onOpenChange={setSearchOpen} />}
            eyebrow={DateTime.now().setLocale(dateLocale()).toFormat('EEEE, d LLLL')}
            title={t(greetingKey(DateTime.now().hour))}
          />
        )}

        {!searchOpen && (
          <>
            <StreakCard />

            {loading && !dashboard ? (
              <AppSkeleton />
            ) : nextRoutine ? (
              <section className={styles.nextSession}>
                <RoutineCarousel
                  activePlan={activePlan}
                  nextRoutine={nextRoutine}
                  routines={dashboard?.routines ?? []}
                  onShowAll={() => setRoutinePickerOpen(true)}
                  onSwitch={(routineId) => useDashboardStore.getState().preferRoutine(routineId)}
                />
                {/* A plan runs the order, so what the row cannot offer — skip
                    it, pause it, see the rest of it — lives one tap away. */}
                {activePlan && (
                  <AppButton type="link" colour="ghost" size="sm" to="/workout">
                    {t('home.workoutOptions')}
                  </AppButton>
                )}
              </section>
            ) : dashboardFailed ? (
              // Onboarding copy for a user who already has routines is the
              // worst thing this screen can say, so a failed load says so.
              <AppErrorState onRetry={() => void useDashboardStore.getState().load()} />
            ) : (
              <AppEmptyState
                action={{ label: t('training.newRoutine'), to: '/routines/create' }}
                body={t('home.createFirstRoutineBody')}
                title={t('home.createFirstRoutine')}
              />
            )}

            <section className={styles.followingFeed}>
              <header>
                <h2>{t('home.latestWorkouts')}</h2>
              </header>

              {feedEntries.length > 0 && (
                <AppList>
                  {feedEntries.map(({ workout, unseen }) => (
                    <CardWorkout key={workout.id} compact unseen={unseen} workout={workout} />
                  ))}
                </AppList>
              )}

              {!feedLoaded ? (
                <AppSkeleton />
              ) : feedError ? (
                <AppErrorState
                  compact
                  title={t('home.loadFailed')}
                  onRetry={() => void loadMoreFeed()}
                />
              ) : feedEntries.length === 0 ? (
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
            {dashboard?.routines.map((routine) => {
              const chosen = routine.id === nextRoutine?.id

              return (
                <AppOptionRow
                  key={routine.id}
                  leading={
                    <span className={styles.routineIcon}>
                      <FireIcon aria-hidden="true" />
                    </span>
                  }
                  selected={chosen}
                  trailing={
                    <span
                      className={cn(styles.selectionIcon, chosen && styles.selectionIconSelected)}
                    >
                      <CheckIcon aria-hidden="true" />
                    </span>
                  }
                  onClick={() => void selectRoutine(routine.id)}
                >
                  <strong>{routine.name}</strong>
                  <small>{t('home.exerciseCount', { count: routine.exercises.length })}</small>
                </AppOptionRow>
              )
            })}
          </div>
        </AppSheet>
      )}
    </>
  )
}
