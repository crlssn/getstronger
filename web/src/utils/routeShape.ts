import {
  buildTimeline,
  measureRoute,
  routeToken,
  type Recording,
  type RoutePoint,
} from './timedCircuit'

/**
 * The intervals of a recording that drew a line, and the colour each takes.
 *
 * The full map and the feed's thumbnail read the same document, and a route
 * whose colours differ between the two reads as two different routes.
 */
export const routeIntervals = (recording: Recording) => {
  const routes = measureRoute(
    recording,
    buildTimeline(recording, recording.endedAt ?? recording.startedAt),
  ).filter((route) => route.phase.exerciseId && route.durationSeconds > 0)
  const exercises = [
    ...new Map(routes.map(({ phase }) => [phase.exerciseId, phase.name])).entries(),
  ]

  return {
    routes,
    exercises,
    // findIndex answers -1 for an exercise that drew nothing, which is no
    // position in the palette; the first colour is the honest stand-in.
    colorToken: (id: string) =>
      routeToken(Math.max(0, exercises.findIndex(([exerciseId]) => exerciseId === id))),
  }
}

/**
 * Joins consecutive edges into as few lines as the gaps allow.
 *
 * The map tiles its GeoJSON and simplifies each feature on its own, so an
 * edge a few metres long — one line per fix — vanishes at the zoom a phone
 * shows a route at, leaving a scatter of stubs. One line per unbroken run
 * survives at any zoom, and joins where the edges meet.
 */
export const routeRuns = (segments: [RoutePoint, RoutePoint][]): RoutePoint[][] => {
  const runs: RoutePoint[][] = []
  let previous: RoutePoint | undefined
  for (const [a, b] of segments) {
    if (previous?.timestamp !== a.timestamp) runs.push([a])
    runs[runs.length - 1].push(b)
    previous = b
  }

  return runs
}

/** A point of a route, in the coordinates of the box it is drawn in. */
export interface BoxPoint {
  x: number
  y: number
}

/**
 * Fits a route into a square box, centred, inside `padding`.
 *
 * Web Mercator, the projection the map itself draws in, so a route keeps its
 * shape whichever of the two is showing it. Centred on the axis it does not
 * fill: anchored, a route wider than it is tall hung from the top of its box.
 */
export const fitRoute = (points: RoutePoint[], size: number, padding: number) => {
  // Longitudes are measured from the first fix so a route crossing the date
  // line takes the short way round rather than spanning the world.
  const origin = points[0]?.longitude ?? 0
  const project = ({ latitude, longitude }: RoutePoint): BoxPoint => ({
    x: ((longitude - origin + 540) % 360) - 180,
    y:
      (-Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, latitude)) * Math.PI) / 360)) *
        180) /
      Math.PI,
  })

  const bounds = points.map(project).reduce(
    (box, point) => ({
      minX: Math.min(box.minX, point.x),
      minY: Math.min(box.minY, point.y),
      maxX: Math.max(box.maxX, point.x),
      maxY: Math.max(box.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  )
  const box = size - padding * 2
  const spanX = Math.max(0, bounds.maxX - bounds.minX)
  const spanY = Math.max(0, bounds.maxY - bounds.minY)
  // A session that never moved has no span to divide by, and belongs in the
  // middle of its box rather than at a coordinate of infinity.
  const scale = box / Math.max(spanX, spanY, 0.00001)
  const offset = (span: number) => padding + (box - span * scale) / 2

  return (point: RoutePoint): BoxPoint => {
    const { x, y } = project(point)
    return {
      x: offset(spanX) + (x - bounds.minX) * scale,
      y: offset(spanY) + (y - bounds.minY) * scale,
    }
  }
}

/** The stride bringing a route near `limit` points; 1 leaves it as it is. */
export const routeStride = (runs: RoutePoint[][], limit: number) =>
  Math.max(1, Math.ceil(runs.reduce((total, run) => total + run.length, 0) / limit))

/** Every nth fix, keeping both ends so neighbouring intervals still meet. */
export const thinRun = (run: RoutePoint[], stride: number): RoutePoint[] =>
  stride <= 1 ? run : run.filter((_, index) => index % stride === 0 || index === run.length - 1)
