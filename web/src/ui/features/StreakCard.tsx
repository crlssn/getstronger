import { DateTime } from 'luxon'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { useStreakStore } from '@/stores/streak'
import { cn } from '@/ui/cn'
import { streakWeeks } from '@/utils/streakWeeks'
import styles from './StreakCard.module.css'

/** One-row streak card: the count, the state in words, eight weeks of ticks. */
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

  const title = streak ? t('streak.weekStreakTitle') : t('streak.startTitle')

  // Today still counts: on the week's last day one day is left, not zero.
  const daysLeft = Math.ceil(DateTime.now().endOf('week').diff(DateTime.now(), 'days').days)
  const meta = thisWeekLogged
    ? t('streak.securedMeta')
    : streak
      ? t('streak.daysLeft', { count: daysLeft })
      : t('streak.startMeta')

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
      <span className={styles.streakCount}>{streak}</span>
      <div className={styles.copy}>
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
      <div className={styles.weekTicks} role="list" aria-label={t('streak.trackAria')}>
        {weeks.map((week) => (
          <span
            key={week.weeksAgo}
            role="listitem"
            className={cn(
              styles.tick,
              week.complete && styles.complete,
              week.current && styles.current,
            )}
            aria-label={`${labelFor(week.weeksAgo)}: ${statusFor(week)}`}
          />
        ))}
      </div>
    </section>
  )
}
