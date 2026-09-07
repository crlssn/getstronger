import { useMemo } from 'react'

import { fitRoute, routeIntervals, routeRuns, routeStride, thinRun } from '@/utils/routeShape'
import type { Recording } from '@/utils/timedCircuit'
import styles from './RouteThumbnail.module.css'

// The avatar's square, so the row is the height it has always been.
const size = 44
const inset = 6
// What 44px can show. An hour recorded is a fix every five seconds.
const maxPoints = 40

/**
 * The shape of a recorded route, small enough to sit in a feed row.
 *
 * An SVG rather than a map: the feed shows ten rows at once, and a MapLibre
 * instance apiece would fetch tiles and start a worker to fill 44 pixels. The
 * workout the row opens carries the real map.
 */
export const RouteThumbnail = ({ recording }: { recording: Recording }) => {
  const lines = useMemo(() => {
    const { routes, colorToken } = routeIntervals(recording)
    const drawn = routes.map((route) => ({ route, runs: routeRuns(route.segments) }))
    const stride = routeStride(
      drawn.flatMap(({ runs }) => runs),
      maxPoints,
    )
    const fit = fitRoute(
      routes.flatMap((route) => route.segments.flat()),
      size,
      inset,
    )

    return drawn.flatMap(({ route, runs }) =>
      runs.map((run, index) => ({
        key: `${route.phase.stationKey}-${route.phase.round}-${index}`,
        color: `var(${colorToken(route.phase.exerciseId)})`,
        points: thinRun(run, stride)
          .map((fix) => {
            const { x, y } = fit(fix)
            return `${x.toFixed(1)},${y.toFixed(1)}`
          })
          .join(' '),
      })),
    )
  }, [recording])

  // A session whose fixes were all rejected has no shape to show, and an empty
  // tile beside the numbers says less than no tile at all.
  if (!lines.length) return null

  return (
    <span className={styles.thumbnail}>
      {/* The row's link already names the workout; this is a picture of it. */}
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {lines.map((line) => (
          // A presentation attribute cannot read a custom property; a style can.
          <polyline key={line.key} points={line.points} style={{ stroke: line.color }} />
        ))}
      </svg>
    </span>
  )
}
