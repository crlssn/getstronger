import type { WorkoutGroupExercise } from '@/proto/api/v1/workout_service_pb'

import { TrophyIcon } from '@heroicons/react/24/solid'
import { useTranslation } from 'react-i18next'

import { formatExerciseSet } from '@/utils/exerciseMeasurements'
import styles from './CardWorkoutCircuit.module.css'

interface Props {
  exercises: readonly WorkoutGroupExercise[]
}

/**
 * A circuit of a finished workout, read round by round.
 *
 * A circuit is not a list of exercises each with its sets: it is one set of
 * each, then round again, and the accordion the rest of the workout uses hides
 * exactly the thing that makes it a circuit. So the rounds are the structure
 * here, and the exercises are the rows inside them.
 *
 * Rounds rather than a grid of exercise columns: a block of five exercises has
 * five columns, and a phone has room for two.
 */
export const CardWorkoutCircuit = ({ exercises }: Props) => {
  const { t } = useTranslation()

  // The rounds actually worked, which is what the longest-worked exercise says.
  // The prescription is what was asked for; this is what happened.
  const rounds = Math.max(0, ...exercises.map((entry) => entry.sets.length))

  return (
    <div className={styles.rounds}>
      {Array.from({ length: rounds }, (_, round) => (
        <section key={round} className={styles.round}>
          <h4 className={styles.roundLabel}>{t('workout.roundPosition', { round: round + 1 })}</h4>

          <div className={styles.roundSets}>
            {exercises.map((entry) => {
              const set = entry.sets[round]
              const personalBest = Boolean(set?.metadata?.personalBest)

              return (
                <div key={entry.exercise?.id ?? entry.exercise?.name} className={styles.roundRow}>
                  <span className={styles.exerciseName}>{entry.exercise?.name}</span>
                  {/* An exercise the athlete stopped taking before the block
                      closed has no set this round, and says so rather than
                      shifting the rows above it out of line. */}
                  <span className={styles.setValue}>
                    {set ? formatExerciseSet(set, entry.exercise) : '—'}
                    {personalBest && (
                      <TrophyIcon
                        className={styles.personalBest}
                        aria-label={t('workout.personalBest')}
                      />
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
