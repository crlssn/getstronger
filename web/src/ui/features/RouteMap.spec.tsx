import type { FeatureCollection, LineString } from 'geojson'
import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLocaleStore } from '@/stores/locale'
import { renderWithProviders } from '@/ui/testing'
import { mapSupported } from '@/utils/mapSupport'
import { RouteMap, type RouteLine } from './RouteMap'

// A stand-in for MapLibre: it records what the map was built with and lets a
// test fire the events the real one would.
const maplibre = vi.hoisted(() => {
  const handlers: Record<string, (() => void)[]> = {}
  const instance = {
    on: vi.fn((event: string, handler: () => void) => {
      ;(handlers[event] ??= []).push(handler)
    }),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    remove: vi.fn(),
    touchZoomRotate: { disableRotation: vi.fn() },
  }
  const options: Record<string, unknown>[] = []
  return {
    handlers,
    instance,
    options,
    fire: (event: string) => handlers[event]?.forEach((handler) => handler()),
    reset: () => {
      Object.keys(handlers).forEach((event) => delete handlers[event])
      options.length = 0
      instance.addSource.mockClear()
      instance.addLayer.mockClear()
      instance.remove.mockClear()
    },
  }
})

const setWorkerUrl = vi.hoisted(() => vi.fn())
vi.mock('maplibre-gl', () => ({
  setWorkerUrl,
  Map: class {
    constructor(options: Record<string, unknown>) {
      maplibre.options.push(options)
      return maplibre.instance
    }
  },
  LngLatBounds: class {
    extend() {
      return this
    }
  },
}))
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({
  default: '/assets/worker.mjs',
}))

// A fix a second per thousandth of a degree, so timestamps tell fixes apart.
const point = (longitude: number) => ({
  timestamp: Math.round(longitude * 1_000_000),
  latitude: 51,
  longitude,
  accuracy: 3,
})

const lines: RouteLine[] = [
  { key: 'walk-1', colorToken: '--color-route-1', segments: [[point(0), point(0.001)]] },
  {
    key: 'run-1',
    colorToken: '--color-route-2',
    segments: [
      [point(0.001), point(0.002)],
      [point(0.002), point(0.003)],
    ],
  },
]

describe('RouteMap', () => {
  beforeEach(() => {
    maplibre.reset()
    useLocaleStore.setState({ theme: undefined, deviceTheme: 'light' })
  })

  it('is not supported where there is no WebGL, which is what jsdom is', () => {
    expect(mapSupported()).toBe(false)
  })

  it('draws one coloured line per edge once the style has loaded', async () => {
    renderWithProviders(<RouteMap lines={lines} onUnavailable={vi.fn()} />)

    expect(screen.getByRole('region', { name: 'Route map' })).toBeInTheDocument()
    await waitFor(() => expect(maplibre.options).toHaveLength(1))
    // The worker is this build's own asset, not a path MapLibre guesses.
    expect(setWorkerUrl).toHaveBeenCalledWith('/assets/worker.mjs')
    expect(maplibre.options[0].style).toBe('https://tiles.openfreemap.org/styles/positron')
    expect(maplibre.options[0].cooperativeGestures).toBe(true)
    // The card credits the tiles beside the map, so the map's own control is
    // off: the built-in one is a 24px button, under the tap floor, over the
    // route.
    expect(maplibre.options[0].attributionControl).toBe(false)

    maplibre.fire('load')
    const [, source] = maplibre.instance.addSource.mock.calls[0] as [
      string,
      { data: FeatureCollection<LineString, { color: string }> },
    ]
    // One line per interval, its edges chained: two-point lines a few metres
    // long simplify away at a phone's zoom.
    expect(source.data.features.map((feature) => feature.properties.color)).toEqual([
      '#2f6fed',
      '#d9542b',
    ])
    expect(source.data.features[0].geometry.coordinates).toEqual([
      [0, 51],
      [0.001, 51],
    ])
    expect(source.data.features[1].geometry.coordinates).toEqual([
      [0.001, 51],
      [0.002, 51],
      [0.003, 51],
    ])
    expect(maplibre.instance.addLayer).toHaveBeenCalledOnce()
  })

  it('breaks a line where the route has a gap, and nowhere else', async () => {
    const gapped: RouteLine[] = [
      {
        key: 'run-1',
        colorToken: '--color-route-1',
        segments: [
          [point(0), point(0.001)],
          [point(0.001), point(0.002)],
          // A pause, or fixes the recorder threw out: the line stops and starts.
          [point(0.005), point(0.006)],
        ],
      },
    ]
    renderWithProviders(<RouteMap lines={gapped} onUnavailable={vi.fn()} />)
    await waitFor(() => expect(maplibre.options).toHaveLength(1))

    maplibre.fire('load')
    const [, source] = maplibre.instance.addSource.mock.calls[0] as [
      string,
      { data: FeatureCollection<LineString, { color: string }> },
    ]
    expect(source.data.features.map((feature) => feature.geometry.coordinates.length)).toEqual([
      3, 2,
    ])
  })

  it('takes the dark style under the dark palette', async () => {
    useLocaleStore.setState({ theme: 'dark' })
    renderWithProviders(<RouteMap lines={lines} onUnavailable={vi.fn()} />)

    await waitFor(() => expect(maplibre.options).toHaveLength(1))
    expect(maplibre.options[0].style).toBe('https://tiles.openfreemap.org/styles/dark')
  })

  it('gives up only when the style itself never arrives', async () => {
    const onUnavailable = vi.fn()
    renderWithProviders(<RouteMap lines={lines} onUnavailable={onUnavailable} />)
    await waitFor(() => expect(maplibre.options).toHaveLength(1))

    maplibre.fire('error')
    expect(onUnavailable).toHaveBeenCalledOnce()

    // A tile lost after the map is up is a hole, not a missing map.
    maplibre.fire('load')
    maplibre.fire('error')
    expect(onUnavailable).toHaveBeenCalledOnce()
  })

  it('removes the map when it unmounts', async () => {
    const { unmount } = renderWithProviders(<RouteMap lines={lines} onUnavailable={vi.fn()} />)
    await waitFor(() => expect(maplibre.options).toHaveLength(1))

    unmount()
    expect(maplibre.instance.remove).toHaveBeenCalledOnce()
  })
})
