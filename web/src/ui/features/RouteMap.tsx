import type { Feature, LineString } from 'geojson'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { selectTheme, useLocaleStore } from '@/stores/locale'
import type { AppTheme } from '@/theme'
import type { RoutePoint } from '@/utils/timedCircuit'
// The worker built by Vite as its own bundle, with the module it imports
// folded in. Left to MapLibre, the worker is a URL relative to its own module,
// which the build rewrote into the assets folder without writing the file, and
// copying the file alone leaves its import behind to 404 the same way.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import styles from './WorkoutRoute.module.css'

/** One coloured run of a route: an interval, as the fix-to-fix edges inside it. */
export interface RouteLine {
  key: string
  /** The theme token the line is painted in, resolved when the map mounts. */
  colorToken: string
  segments: [RoutePoint, RoutePoint][]
}

interface Props {
  lines: RouteLine[]
  /** The map could not be drawn — no WebGL, or the tiles never came. */
  onUnavailable: () => void
}

// OpenFreeMap serves OpenStreetMap as vector tiles without a key; the two
// styles are the quiet ones, so the route is the only colour on the page.
const styleURL: Record<AppTheme, string> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
}

// The light palette, for a token the document does not carry.
const fallbackColors: Record<string, string> = {
  '--color-route-1': '#2f6fed',
  '--color-route-2': '#d9542b',
  '--color-route-3': '#6d3fc4',
  '--color-route-4': '#1f8f5f',
  '--color-route-5': '#c4287a',
  '--color-route-6': '#0e8aa6',
}

const resolveColor = (token: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(token).trim() ||
  fallbackColors[token] ||
  '#888888'

/**
 * The recorded route over a real map.
 *
 * MapLibre is loaded when the first route is looked at rather than with the
 * app, since most sessions never open one. The map is rebuilt when the palette
 * changes so its style and the line colours follow it.
 */
export const RouteMap = ({ lines, onUnavailable }: Props) => {
  const { t } = useTranslation()
  const theme = useLocaleStore(selectTheme)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = container.current
    if (!element) return undefined

    let disposed = false
    let map: import('maplibre-gl').Map | undefined

    const mount = async () => {
      const [maplibregl] = await Promise.all([
        import('maplibre-gl'),
        import('maplibre-gl/dist/maplibre-gl.css'),
      ])
      if (disposed) return
      maplibregl.setWorkerUrl(workerUrl)

      const features: Feature<LineString, { color: string }>[] = lines.flatMap((line) =>
        line.segments.map(([a, b]) => ({
          type: 'Feature',
          properties: { color: resolveColor(line.colorToken) },
          geometry: {
            type: 'LineString',
            coordinates: [
              [a.longitude, a.latitude],
              [b.longitude, b.latitude],
            ],
          },
        })),
      )
      const bounds = new maplibregl.LngLatBounds()
      features.forEach((feature) =>
        feature.geometry.coordinates.forEach(([longitude, latitude]) =>
          bounds.extend([longitude, latitude]),
        ),
      )

      const instance = new maplibregl.Map({
        container: element,
        style: styleURL[theme],
        bounds,
        fitBoundsOptions: { padding: 32 },
        // The credit is set beside the map instead: the built-in control is a
        // 24px button, under the tap-target floor, over the route.
        attributionControl: false,
        locale: {
          'CooperativeGesturesHandler.MobileHelpText': t('timedCircuit.mapTwoFingers'),
          'CooperativeGesturesHandler.MacHelpText': t('timedCircuit.mapScrollMac'),
          'CooperativeGesturesHandler.WindowsHelpText': t('timedCircuit.mapScrollWindows'),
        },
        // A finger on the map scrolls the page; two move the map. Otherwise a
        // route in the middle of a workout page traps every scroll over it.
        cooperativeGestures: true,
        dragRotate: false,
        pitchWithRotate: false,
      })
      map = instance
      instance.touchZoomRotate.disableRotation()

      // A tile that fails after the style is up leaves a hole, which is the
      // map's own problem. A style that never arrives is no map at all.
      let loaded = false
      instance.on('error', () => {
        if (!loaded && !disposed) onUnavailable()
      })
      instance.on('load', () => {
        loaded = true
        instance.addSource('route', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
        })
        instance.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': 4 },
        })
      })
    }

    mount().catch(() => {
      if (!disposed) onUnavailable()
    })

    return () => {
      disposed = true
      map?.remove()
    }
  }, [lines, theme, onUnavailable, t])

  // A region rather than an image: the map inside is something to operate,
  // and an image may hold nothing interactive. The tile licence's credit is
  // the caller's to place: it belongs under the frame the map fills, not in it.
  return (
    <div ref={container} className={styles.map} role="region" aria-label={t('timedCircuit.map')} />
  )
}
