import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { usePreferencesStore } from '@/stores/preferences'
import { DistanceUnit } from '@/proto/api/v1/shared_pb'
import { distanceUnitLabel } from '@/utils/distanceUnits'
import { buildTimeline, measureRoute, type Recording } from '@/utils/timedCircuit'
import { elapsedLabel } from '@/utils/workoutSession'
import styles from './WorkoutRoute.module.css'

// The theme owns the hues, in both palettes; this only cycles through them.
const routeColors = 6
const routeColor = (index: number) => `var(--color-route-${(index % routeColors) + 1})`

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
  const exercises = [
    ...new Map(routes.map(({ phase }) => [phase.exerciseId, phase.name])).entries(),
  ]
  const color = (id: string) => routeColor(exercises.findIndex(([exerciseId]) => exerciseId === id))
  const points = routes.flatMap((route) => route.segments.flat())
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
  const label = (meters: number) =>
    `${(meters / (unit === DistanceUnit.MILES ? 1609.344 : 1000)).toFixed(2)} ${distanceUnitLabel(unit)}`
  return (
    <section className={styles.route}>
      <h2>{t('timedCircuit.route')}</h2>
      {points.length > 0 ? (
        <svg viewBox="0 0 300 300" role="img" aria-label={t('timedCircuit.route')}>
          <title>{t('timedCircuit.route')}</title>
          {routes.map((route) => (
            <path
              key={`${route.phase.stationKey}-${route.phase.round}`}
              d={route.segments
                .map(
                  ([a, b]) => `M ${xy(a.latitude, a.longitude)} L ${xy(b.latitude, b.longitude)}`,
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
      ) : (
        <p>{t('timedCircuit.noRoute')}</p>
      )}
      <ul className={styles.legend}>
        {exercises.map(([id, name]) => (
          <li key={id}>
            <span style={{ backgroundColor: color(id) }} aria-hidden="true" />
            {name}
          </li>
        ))}
      </ul>
      {routes.some((route) => route.incomplete) && (
        <p role="status">{t('timedCircuit.incomplete')}</p>
      )}
      <p>
        {t('timedCircuit.total', {
          duration: elapsedLabel(
            Math.round(routes.reduce((sum, route) => sum + route.durationSeconds, 0)),
          ),
          distance: label(routes.reduce((sum, route) => sum + route.distanceMeters, 0)),
        })}
      </p>
      <ol>
        {routes.map((route) => (
          <li key={`${route.phase.stationKey}-${route.phase.round}`}>
            {t('timedCircuit.interval', {
              name: route.phase.name,
              round: route.phase.round,
              duration: elapsedLabel(Math.round(route.durationSeconds)),
              distance: label(route.distanceMeters),
            })}
          </li>
        ))}
      </ol>
    </section>
  )
}
