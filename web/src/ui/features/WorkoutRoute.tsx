import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePreferencesStore } from '@/stores/preferences'
import { DistanceUnit } from '@/proto/api/v1/shared_pb'
import { AppChip } from '@/ui/components/AppChip'
import { AppStat } from '@/ui/components/AppStat'
import { distanceUnitLabel } from '@/utils/distanceUnits'
import { paceIn } from '@/utils/exerciseMeasurements'
import { fitRoute, routeIntervals } from '@/utils/routeShape'
import {
  isIntervalRecording,
  recordedRounds,
  type Recording,
  type RoutePoint,
} from '@/utils/timedCircuit'
import { WorkoutIntervals } from './WorkoutIntervals'
import { elapsedLabel } from '@/utils/workoutSession'
import { mapSupported } from '@/utils/mapSupport'
import { RouteMap, type RouteLine } from './RouteMap'
import styles from './WorkoutRoute.module.css'

const metersPerKilometer = 1000
const metersPerMile = 1609.344

// The square the route is drawn into when there is no map behind it.
const frame = 300
const frameInset = 15

export const WorkoutRoute = ({ recording }: { recording: Recording }) => {
  const { t } = useTranslation()
  const unit = usePreferencesStore((state) => state.distanceUnit)
  const { routes, exercises, colorToken } = useMemo(() => routeIntervals(recording), [recording])
  const color = (id: string) => `var(${colorToken(id)})`
  const points = routes.flatMap((route) => route.segments.flat())

  // An interval routine is one session with a shape, so it reads as one
  // numbered sequence; a gym circuit has no such shape and reads as its rounds.
  const readsAsIntervals = isIntervalRecording(recording)
  const roundCount = recordedRounds(recording)

  // A session reads as its rounds rather than as its intervals: twelve lines
  // saying "Walk · Round 1" and "Run · Round 1" are six laps of the same loop.
  const rounds = useMemo(() => {
    const grouped = new Map<number, typeof routes>()
    for (const route of routes) {
      const round = grouped.get(route.phase.round)
      if (round) round.push(route)
      else grouped.set(route.phase.round, [route])
    }
    return [...grouped.entries()].sort(([a], [b]) => a - b)
  }, [routes])

  // What the circuit prescribed, read off its first round: the rounds below
  // then only have to say how each of them actually went. A session with no set
  // length prescribed nothing, so it says nothing here.
  const prescription = (rounds[0]?.[1] ?? [])
    .map(({ phase }) =>
      phase.durationSeconds === undefined
        ? ''
        : `${phase.name} ${elapsedLabel(phase.durationSeconds)}`,
    )
    .filter(Boolean)
    .join(' → ')

  // The map when the browser and the tiles allow it; the bare shape of the
  // route otherwise, which is also what an offline reopening gets.
  const [mapUnavailable, setMapUnavailable] = useState(() => !mapSupported())
  const onMapUnavailable = useCallback(() => setMapUnavailable(true), [])
  const lines = useMemo<RouteLine[]>(
    () =>
      routes.map((route) => ({
        key: `${route.phase.stationKey}-${route.phase.round}`,
        colorToken: colorToken(route.phase.exerciseId),
        segments: route.segments,
      })),
    [routes, colorToken],
  )
  const fit = fitRoute(points, frame, frameInset)
  const xy = (point: RoutePoint) => {
    const { x, y } = fit(point)
    return `${x},${y}`
  }
  const measured = (meters: number) => ({
    value: (meters / (unit === DistanceUnit.MILES ? metersPerMile : metersPerKilometer)).toFixed(2),
    unit: distanceUnitLabel(unit),
  })
  const label = (meters: number) => {
    const { value, unit: suffix } = measured(meters)
    return `${value} ${suffix}`
  }
  const mapped = points.length > 0 && !mapUnavailable
  const activeSeconds = Math.round(routes.reduce((sum, route) => sum + route.durationSeconds, 0))
  const meters = routes.reduce((sum, route) => sum + route.distanceMeters, 0)
  const recorded = measured(meters)
  // The number an interval session was for, over the whole of it. A gym circuit
  // covers no ground worth a pace, so it is not offered one.
  const averagePace =
    readsAsIntervals && meters > 0 && activeSeconds > 0
      ? paceIn((activeSeconds / meters) * 1000, unit)
      : undefined

  return (
    <section className={styles.route}>
      <header className={styles.heading}>
        <h2>{t(readsAsIntervals ? 'timedCircuit.intervals' : 'timedCircuit.route')}</h2>
        <AppChip>
          {t('timedCircuit.rounds', { count: readsAsIntervals ? roundCount : rounds.length })}
        </AppChip>
      </header>

      {/* A square, so the loop a session ran reads as a shape. Nothing to draw
          is a line saying so rather than an empty square of that size. */}
      {points.length > 0 ? (
        <div className={styles.mapFrame}>
          {mapped ? (
            <RouteMap lines={lines} onUnavailable={onMapUnavailable} />
          ) : (
            <svg viewBox={`0 0 ${frame} ${frame}`} role="img" aria-label={t('timedCircuit.route')}>
              <title>{t('timedCircuit.route')}</title>
              {routes.map((route) => (
                <path
                  key={`${route.phase.stationKey}-${route.phase.round}`}
                  d={route.segments.map(([a, b]) => `M ${xy(a)} L ${xy(b)}`).join(' ')}
                  fill="none"
                  // A presentation attribute cannot read a custom property; a style can.
                  style={{ stroke: color(route.phase.exerciseId) }}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              ))}
            </svg>
          )}

          {/* The legend rides on the map rather than under it: the colours name
              the lines, and a reader looking at one should not look away. */}
          <ul className={styles.legend}>
            {exercises.map(([id, name]) => (
              <li key={id}>
                <span style={{ backgroundColor: color(id) }} aria-hidden="true" />
                {name}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className={styles.empty}>{t('timedCircuit.noRoute')}</p>
      )}

      {mapped && <p className={styles.credit}>{t('timedCircuit.mapCredit')}</p>}

      <div className={styles.totals}>
        <AppStat
          className={styles.tile}
          size="md"
          label={t('timedCircuit.activeTime')}
          value={elapsedLabel(activeSeconds)}
        />
        <AppStat
          className={styles.tile}
          size="md"
          label={t('timedCircuit.recordedDistance')}
          value={recorded.value}
          unit={recorded.unit}
        />
        {averagePace && (
          <AppStat
            className={styles.tile}
            size="md"
            label={t('timedCircuit.averagePace')}
            value={averagePace.value}
            unit={averagePace.unit}
          />
        )}
      </div>

      {routes.some((route) => route.incomplete) && (
        <p className={styles.incomplete} role="status">
          {t('timedCircuit.incomplete')}
        </p>
      )}

      {readsAsIntervals ? (
        <WorkoutIntervals
          intervals={routes}
          rounds={roundCount}
          colour={color}
          distance={label}
          unit={unit}
        />
      ) : (
        rounds.length > 0 && (
          <>
            <div className={styles.roundsHeading}>
              <span>{t('timedCircuit.roundsHeading')}</span>
              <small>{prescription}</small>
            </div>

            <ol className={styles.rounds}>
              {rounds.map(([round, intervals]) => (
                <li key={round}>
                  {/* The lap number, and what it is in words: a bare "3" beside
                    two intervals says nothing about what the three counts. */}
                  <span className={styles.roundNumber}>
                    <span aria-hidden="true">{round}</span>
                    <span className="sr-only">{t('workout.roundPosition', { round })}</span>
                  </span>

                  <div className={styles.roundBody}>
                    {/* The lap at a glance: how the round was divided, in the
                      colours the map is drawn in. The line below carries the
                      numbers, so the bar says nothing a reader cannot read. */}
                    <span className={styles.bar} aria-hidden="true">
                      {intervals.map((interval) => (
                        <span
                          key={`${interval.phase.stationKey}-${interval.phase.round}`}
                          style={{
                            flexGrow: interval.durationSeconds,
                            backgroundColor: color(interval.phase.exerciseId),
                          }}
                        />
                      ))}
                    </span>

                    <p className={styles.intervals}>
                      {intervals.map((interval) => (
                        <span key={`${interval.phase.stationKey}-${interval.phase.round}`}>
                          <span
                            className={styles.dot}
                            style={{ backgroundColor: color(interval.phase.exerciseId) }}
                            aria-hidden="true"
                          />
                          {interval.phase.name}
                          <strong>{elapsedLabel(Math.round(interval.durationSeconds))}</strong>
                          <small>{label(interval.distanceMeters)}</small>
                        </span>
                      ))}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )
      )}
    </section>
  )
}
