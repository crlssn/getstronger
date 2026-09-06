import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePreferencesStore } from '@/stores/preferences'
import { DistanceUnit } from '@/proto/api/v1/shared_pb'
import { AppChip } from '@/ui/components/AppChip'
import { AppStat } from '@/ui/components/AppStat'
import { distanceUnitLabel } from '@/utils/distanceUnits'
import { buildTimeline, measureRoute, type Recording } from '@/utils/timedCircuit'
import { elapsedLabel } from '@/utils/workoutSession'
import { mapSupported } from '@/utils/mapSupport'
import { RouteMap, type RouteLine } from './RouteMap'
import styles from './WorkoutRoute.module.css'

// The theme owns the hues, in both palettes; this only cycles through them.
const routeColors = 6
const routeToken = (index: number) => `--color-route-${(index % routeColors) + 1}`

const metersPerKilometer = 1000
const metersPerMile = 1609.344

export const WorkoutRoute = ({ recording }: { recording: Recording }) => {
  const { t } = useTranslation()
  const unit = usePreferencesStore((state) => state.distanceUnit)
  const routes = useMemo(
    () =>
      measureRoute(
        recording,
        buildTimeline(recording, recording.endedAt ?? recording.startedAt),
      ).filter((route) => route.phase.exerciseId && route.durationSeconds > 0),
    [recording],
  )
  const exercises = useMemo(
    () => [...new Map(routes.map(({ phase }) => [phase.exerciseId, phase.name])).entries()],
    [routes],
  )
  const token = useCallback(
    (id: string) => routeToken(exercises.findIndex(([exerciseId]) => exerciseId === id)),
    [exercises],
  )
  const color = (id: string) => `var(${token(id)})`
  const points = routes.flatMap((route) => route.segments.flat())

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
  // then only have to say how each of them actually went.
  const prescription = (rounds[0]?.[1] ?? [])
    .map(({ phase }) => `${phase.name} ${elapsedLabel(phase.durationSeconds)}`)
    .join(' → ')

  // The map when the browser and the tiles allow it; the bare shape of the
  // route otherwise, which is also what an offline reopening gets.
  const [mapUnavailable, setMapUnavailable] = useState(() => !mapSupported())
  const onMapUnavailable = useCallback(() => setMapUnavailable(true), [])
  const lines = useMemo<RouteLine[]>(
    () =>
      routes.map((route) => ({
        key: `${route.phase.stationKey}-${route.phase.round}`,
        colorToken: token(route.phase.exerciseId),
        segments: route.segments,
      })),
    [routes, token],
  )
  const origin = points[0]?.longitude ?? 0
  const project = (latitude: number, longitude: number) => ({
    x: ((longitude - origin + 540) % 360) - 180,
    y:
      (-Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, latitude)) * Math.PI) / 360)) *
        180) /
      Math.PI,
  })
  const projected = points.map((point) => project(point.latitude, point.longitude))
  const bounds = projected.reduce(
    (box, point) => ({
      minX: Math.min(box.minX, point.x),
      minY: Math.min(box.minY, point.y),
      maxX: Math.max(box.maxX, point.x),
      maxY: Math.max(box.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  )
  const { minX, minY } = bounds
  const spanX = bounds.maxX - minX
  const spanY = bounds.maxY - minY
  const scale = 270 / Math.max(spanX, spanY, 0.00001)
  const xy = (latitude: number, longitude: number) => {
    const point = project(latitude, longitude)
    return `${15 + (point.x - minX) * scale},${15 + (point.y - minY) * scale}`
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
  const recorded = measured(routes.reduce((sum, route) => sum + route.distanceMeters, 0))

  return (
    <section className={styles.route}>
      <header className={styles.heading}>
        <h2>{t('timedCircuit.route')}</h2>
        <AppChip>{t('timedCircuit.rounds', { count: rounds.length })}</AppChip>
      </header>

      {/* A square, so the loop a session ran reads as a shape. Nothing to draw
          is a line saying so rather than an empty square of that size. */}
      {points.length > 0 ? (
        <div className={styles.mapFrame}>
          {mapped ? (
            <RouteMap lines={lines} onUnavailable={onMapUnavailable} />
          ) : (
            <svg viewBox="0 0 300 300" role="img" aria-label={t('timedCircuit.route')}>
              <title>{t('timedCircuit.route')}</title>
              {routes.map((route) => (
                <path
                  key={`${route.phase.stationKey}-${route.phase.round}`}
                  d={route.segments
                    .map(
                      ([a, b]) =>
                        `M ${xy(a.latitude, a.longitude)} L ${xy(b.latitude, b.longitude)}`,
                    )
                    .join(' ')}
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
          value={elapsedLabel(
            Math.round(routes.reduce((sum, route) => sum + route.durationSeconds, 0)),
          )}
        />
        <AppStat
          className={styles.tile}
          size="md"
          label={t('timedCircuit.recordedDistance')}
          value={recorded.value}
          unit={recorded.unit}
        />
      </div>

      {routes.some((route) => route.incomplete) && (
        <p className={styles.incomplete} role="status">
          {t('timedCircuit.incomplete')}
        </p>
      )}

      {rounds.length > 0 && (
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
      )}
    </section>
  )
}
