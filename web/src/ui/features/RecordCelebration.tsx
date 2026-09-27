import type { Workout } from '@/proto/api/v1/workout_service_pb'

import { TrophyIcon } from '@heroicons/react/24/outline'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { AppStat } from '@/ui/components/AppStat'
import { formatExerciseSet } from '@/utils/exerciseMeasurements'
import { usePrefersReducedMotion } from '@/utils/usePrefersReducedMotion'
import styles from './RecordCelebration.module.css'

// When the last record row under the card has finished lighting: rows stagger
// 200ms from 1100ms, and only three of them.
const ONE_RECORD_MS = 1500
const SEVERAL_RECORDS_MS = 1800
const STILL_MS = 200

interface Props {
  workout: Workout
  /** The moment is on screen. Once over, only its announcement stays behind. */
  playing: boolean
  /** The moment is over, whether it ran out or was skipped. */
  onDone: () => void
}

/**
 * The records a save just beat, held up for a second before the workout.
 *
 * It plays over the saved workout rather than before it, and never waits on
 * the athlete: a tap or a scroll ends it, and so does the clock. The card is
 * decorative — the workout beneath says the same — so a screen reader hears
 * the count and nothing else.
 */
export const RecordCelebration = ({ workout, playing, onDone }: Props) => {
  const { t } = useTranslation()
  const still = usePrefersReducedMotion()

  const records = workout.exerciseSets.flatMap(({ exercise, sets }) =>
    sets.filter((set) => set.metadata?.personalBest).map((set) => ({ exercise, set })),
  )
  // First in workout order. The biggest improvement should lead, once the API
  // says what each record beat.
  const [headline] = records
  const several = records.length > 1
  const card = playing && !still && records.length > 0

  useEffect(() => {
    if (!playing) return

    const timer = setTimeout(
      onDone,
      still ? STILL_MS : several ? SEVERAL_RECORDS_MS : ONE_RECORD_MS,
    )
    return () => clearTimeout(timer)
  }, [onDone, playing, several, still])

  useEffect(() => {
    if (!card) return

    // Nothing under the card is covered, so a tap would land on the workout:
    // it is spent skipping instead.
    const skipTap = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      onDone()
    }
    document.addEventListener('click', skipTap, true)
    document.addEventListener('scroll', onDone, { capture: true, passive: true })

    return () => {
      document.removeEventListener('click', skipTap, true)
      document.removeEventListener('scroll', onDone, true)
    }
  }, [card, onDone])

  return (
    <>
      {/* Outlives the card: a live region removed as it speaks can be cut off.
          Not a status: the toaster's is the page's one. */}
      <p className="sr-only" aria-live="polite">
        {t('workout.card.prBadge', { count: records.length })}
      </p>

      {card && headline && (
        <div className={styles.moment} aria-hidden="true">
          {several && (
            <>
              <div className={styles.backFar} />
              <div className={styles.backNear} />
            </>
          )}
          <div className={styles.card}>
            <span className={styles.medallion}>
              <TrophyIcon />
            </span>
            <AppStat
              label={t('workout.recordTitle')}
              value={formatExerciseSet(headline.set, headline.exercise)}
              tone="record"
              size="xl"
            />
            <p className={styles.name}>{headline.exercise?.name}</p>
            {several && (
              <p className={styles.more}>
                {t('workout.recordMore', { count: records.length - 1 })}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
