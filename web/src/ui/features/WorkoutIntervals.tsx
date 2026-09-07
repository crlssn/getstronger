import type { MeasuredInterval, PhaseRole } from '@/utils/timedCircuit'

import { useTranslation } from 'react-i18next'

import { DistanceUnit } from '@/proto/api/v1/shared_pb'
import { distanceUnitLabel } from '@/utils/distanceUnits'

import { cn } from '@/ui/cn'
import { intervalPartTitle } from '@/ui/routines/intervalParts'
import { paceIn } from '@/utils/exerciseMeasurements'
import { elapsedLabel } from '@/utils/workoutSession'
import styles from './WorkoutIntervals.module.css'

interface Props {
  /** Every recorded interval, in the order the session ran them. */
  intervals: MeasuredInterval[]
  /** How many times the repeating block went round. */
  rounds: number
  colour: (exerciseId: string) => string
  /** How far this session's distances read, in the unit the athlete prefers. */
  distance: (meters: number) => string
  /** The unit those distances and paces are read in. */
  unit: DistanceUnit
}

/**
 * A recorded interval session, read as one numbered sequence.
 *
 * An interval routine is a warm-up, a block repeated, and a cool-down, and it
 * was read back as those three things — three lists, each numbering its rounds
 * from one. It is one session, so it is one list: numbered straight through,
 * with the round a sub-line under the name rather than a heading over a group
 * of them. Pace is on every row, because it is the number the session was for.
 */
export const WorkoutIntervals = ({ intervals, rounds, colour, distance, unit }: Props) => {
  const { t } = useTranslation()
  const unitLabel = distanceUnitLabel(unit)

  const label = (interval: MeasuredInterval) =>
    `${interval.phase.name} ${elapsedLabel(interval.phase.durationSeconds ?? 0)}`

  // What the routine asked for, read off the parts rather than off the rounds:
  // the warm-up once, the block with the count in front of it, the cool-down.
  const part = (role: PhaseRole) =>
    intervals.filter(
      (interval) =>
        interval.phase.role === role && (role !== 'repeat' || interval.phase.round === 1),
    )
  const block = part('repeat')
  const prescription = [
    ...part('warmup').map(label),
    block.length
      ? t('timedCircuit.prescriptionBlock', {
          count: rounds,
          intervals: block.map(label).join(' → '),
        })
      : '',
    ...part('cooldown').map(label),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <div className={styles.heading}>
        <span>{t('timedCircuit.sequence')}</span>
        <small>{prescription}</small>
      </div>

      {/* The shape of the session in one line: each interval as wide as it was
          long, and the parts outside the count at half strength. */}
      <span className={styles.bar} aria-hidden="true">
        {intervals.map((interval) => (
          <span
            key={`${interval.phase.stationKey}-${interval.phase.round}`}
            className={cn(interval.phase.role !== 'repeat' && styles.outside)}
            style={{
              flexGrow: interval.durationSeconds,
              backgroundColor: colour(interval.phase.exerciseId),
            }}
          />
        ))}
      </span>

      <div className={styles.columns} aria-hidden="true">
        <span />
        <span>{t('timedCircuit.interval')}</span>
        <span>{t('timedCircuit.timeAndDistance', { unit: unitLabel })}</span>
        <span>{t('timedCircuit.pace')}</span>
      </div>

      <ol className={styles.sequence}>
        {intervals.map((interval, position) => {
          const seconds = Math.round(interval.durationSeconds)
          // Seconds per kilometre, which is the unit paceIn reads a stored
          // distance in before converting it to the athlete's.
          const pace =
            interval.distanceMeters > 0 && seconds > 0
              ? paceIn((seconds / interval.distanceMeters) * 1000, unit)
              : undefined

          return (
            <li key={`${interval.phase.stationKey}-${interval.phase.round}`}>
              {/* The number orders the sequence; read aloud, a bare "7" says
                  nothing about what the seven counts. */}
              <span className={styles.number}>
                <span aria-hidden="true">{position + 1}</span>
                <span className="sr-only">
                  {t('timedCircuit.intervalPosition', { position: position + 1 })}
                </span>
              </span>

              <span className={styles.interval}>
                <span className={styles.name}>
                  <span
                    className={styles.dot}
                    style={{ backgroundColor: colour(interval.phase.exerciseId) }}
                    aria-hidden="true"
                  />
                  {interval.phase.name}
                </span>
                <span className={styles.round}>
                  {interval.phase.role === 'repeat' || !interval.phase.role
                    ? t('timedCircuit.round', { round: interval.phase.round, total: rounds })
                    : t(intervalPartTitle[interval.phase.role])}
                </span>
              </span>

              <span className={styles.measure}>
                <strong>{elapsedLabel(seconds)}</strong>
                {distance(interval.distanceMeters)}
              </span>

              <span className={styles.pace}>
                {pace?.value ?? t('timedCircuit.noPace')}
                <small>{pace?.unit ?? `/${unitLabel}`}</small>
              </span>
            </li>
          )
        })}
      </ol>
    </>
  )
}
