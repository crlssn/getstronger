import { CheckIcon } from '@heroicons/react/24/outline'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { useStreakStore } from '@/stores/streak'
import { cn } from '@/ui/cn'
import { streakWeeks } from '@/utils/streakWeeks'
import styles from './StreakCard.module.css'

/** The five-week streak track, and what the user has to do to keep it. */
export const StreakCard = () => {
  const { t } = useTranslation()

  const streak = useStreakStore((state) => state.streak)
  const thisWeekLogged = useStreakStore((state) => state.thisWeekLogged)
  const weekWorkoutCounts = useStreakStore((state) => state.weekWorkoutCounts)
  const loaded = useStreakStore((state) => state.loaded)
  const failed = useStreakStore((state) => state.failed)

  useEffect(() => {
    void useStreakStore.getState().load()
  }, [])

  if (!loaded || failed) return null

  // Spelled out rather than built from a prefix, so every key stays greppable.
  const title = !streak
    ? t('streak.startTitle')
    : thisWeekLogged
      ? t('streak.securedTitle')
      : t('streak.keepAliveTitle')
  const message = !streak
    ? t('streak.startBody')
    : thisWeekLogged
      ? t('streak.securedBody')
      : t('streak.keepAliveBody')

  const weeks = streakWeeks({ streak, thisWeekLogged, weekWorkoutCounts })

  const labelFor = (weeksAgo: number) =>
    weeksAgo === 0 ? t('streak.thisWeek') : t('streak.weeksAgo', { count: weeksAgo })

  const statusFor = (week: (typeof weeks)[number]) => {
    if (week.complete) {
      // A complete week always logged at least one workout, even when the count
      // was not fetched: saying "0 workouts logged" over a tick reads as a bug.
      return t('streak.workoutsLogged', { count: Math.max(1, week.workoutCount) })
    }
    return week.current ? t('streak.stillNeeded') : t('streak.outsideStreak')
  }

  return (
    <section className={cn(styles.streakCard, streak > 0 && styles.active)}>
      {/* The count is the headline number, not a boxed badge: the card is five
          weeks of history and one line saying where they leave you. */}
      <header>
        <div className="min-w-0">
          <small className={styles.eyebrow}>{t('streak.eyebrow')}</small>
          <strong>{title}</strong>
        </div>
        <span className={styles.streakCount}>
          {streak} {t('streak.weeks', { count: streak })}
        </span>
      </header>

      <div className={styles.weekTrack} role="list" aria-label={t('streak.trackAria')}>
        {weeks.map((week) => (
          <span
            key={week.weeksAgo}
            role="listitem"
            className={cn(
              styles.weekBlock,
              week.complete && styles.complete,
              week.current && styles.current,
            )}
            aria-label={`${labelFor(week.weeksAgo)}: ${statusFor(week)}`}
          >
            {week.complete ? (
              <>
                <CheckIcon aria-hidden="true" />
                {week.workoutCount > 1 && (
                  <strong className={styles.weekWorkoutCount}>{week.workoutCountDisplay}</strong>
                )}
              </>
            ) : (
              <span aria-hidden="true" />
            )}
          </span>
        ))}
      </div>

      <div className={styles.trackLabels} aria-hidden="true">
        <span>{t('streak.weeksAgo', { count: 4 })}</span>
        <span className={styles.thisWeekLabel}>{t('streak.thisWeek')}</span>
      </div>

      <p>{message}</p>
    </section>
  )
}
